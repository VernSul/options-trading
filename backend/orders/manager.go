package orders

import (
	"fmt"
	"log"
	"sync"

	"github.com/shopspring/decimal"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
)

type pendingFill struct {
	orderID     string
	filledPrice decimal.Decimal
}

type OrderManager struct {
	mu             sync.Mutex
	trading        *alpaca.Client
	pendingStops   map[string]*PendingStopLoss // entryOrderID -> stop config
	trailingStops  map[string]*TrailingStop    // entryOrderID -> trailing stop
	earlyFills     map[string]pendingFill      // fills that arrived before config was stored
	OnStopPlaced   func(orderID string, stop *alpaca.Order)
	OnTrailingInit func(ts *TrailingStop)
}

func NewOrderManager(trading *alpaca.Client) *OrderManager {
	return &OrderManager{
		trading:       trading,
		pendingStops:  make(map[string]*PendingStopLoss),
		trailingStops: make(map[string]*TrailingStop),
		earlyFills:    make(map[string]pendingFill),
	}
}

func (om *OrderManager) PlaceSmartOrder(req SmartOrder) (*alpaca.Order, error) {
	qty := decimal.NewFromInt(int64(req.Qty))

	orderReq := alpaca.PlaceOrderRequest{
		Symbol:         req.Symbol,
		Qty:            &qty,
		Side:           alpaca.Side(req.Side),
		Type:           alpaca.OrderType(req.Type),
		TimeInForce:    alpaca.Day,
		PositionIntent: alpaca.PositionIntent(req.PositionIntent),
	}

	if req.LimitPrice != nil {
		orderReq.LimitPrice = req.LimitPrice
	}

	order, err := om.trading.PlaceOrder(orderReq)
	if err != nil {
		return nil, fmt.Errorf("place order: %w", err)
	}

	om.mu.Lock()

	if req.StopLoss != nil {
		om.pendingStops[order.ID] = &PendingStopLoss{
			EntryOrderID: order.ID,
			Symbol:       req.Symbol,
			Qty:          req.Qty,
			StopPrice:    req.StopLoss.StopPrice,
			LimitPrice:   req.StopLoss.LimitPrice,
		}
		log.Printf("Queued stop-loss for order %s at %s", order.ID, req.StopLoss.StopPrice)
	}

	if req.TrailingStop != nil {
		ts := &TrailingStop{
			OrderID:       order.ID,
			Symbol:        req.Symbol,
			Qty:           req.Qty,
			TrailAmount:   req.TrailingStop.TrailAmount,
			SafetyStop:    req.TrailingStop.SafetyStop,
			StartPercent:  req.TrailingStop.StartPercent,
			OffsetPercent: req.TrailingStop.OffsetPercent,
			Active:        false,
		}
		om.trailingStops[order.ID] = ts
		log.Printf("Queued trailing stop for order %s startPercent=%s offsetPercent=%s safety=%s",
			order.ID, req.TrailingStop.StartPercent, req.TrailingStop.OffsetPercent, req.TrailingStop.SafetyStop)
	}

	// Check if a fill already arrived while we were placing the order (race condition
	// with market orders that fill near-instantly). Replay the fill now that config is stored.
	var earlyFill *pendingFill
	if ef, ok := om.earlyFills[order.ID]; ok {
		earlyFill = &ef
		delete(om.earlyFills, order.ID)
		log.Printf("Replaying early fill for order %s price=%s", order.ID, ef.filledPrice)
	}

	om.mu.Unlock()

	if earlyFill != nil {
		om.HandleFill(earlyFill.orderID, earlyFill.filledPrice)
	}

	return order, nil
}

func (om *OrderManager) HandleFill(orderID string, filledPrice decimal.Decimal) {
	om.mu.Lock()

	// Check for pending stop-loss
	var pendingStop *PendingStopLoss
	if ps, ok := om.pendingStops[orderID]; ok {
		pendingStop = ps
		delete(om.pendingStops, orderID)
	}

	// Check for pending trailing stop
	var trailingStop *TrailingStop
	if ts, ok := om.trailingStops[orderID]; ok {
		ts.EntryPrice = filledPrice
		// Stay inactive — engine will activate when price reaches start threshold
		ts.Active = false
		trailingStop = ts
	}

	// If neither stop-loss nor trailing stop found, this fill arrived before
	// PlaceSmartOrder stored the config. Buffer it for replay.
	if pendingStop == nil && trailingStop == nil {
		om.earlyFills[orderID] = pendingFill{orderID: orderID, filledPrice: filledPrice}
		om.mu.Unlock()
		log.Printf("Fill arrived before config stored, buffering: order=%s price=%s", orderID, filledPrice)
		return
	}

	om.mu.Unlock()

	// Fire callbacks outside the lock (they may do network calls)
	if pendingStop != nil {
		go om.placeStopOrder(pendingStop)
	}
	if trailingStop != nil {
		go om.placeSafetyNetStop(trailingStop)
		if om.OnTrailingInit != nil {
			om.OnTrailingInit(trailingStop)
		}
	}
}

func (om *OrderManager) placeStopOrder(ps *PendingStopLoss) {
	qty := decimal.NewFromInt(int64(ps.Qty))

	orderReq := alpaca.PlaceOrderRequest{
		Symbol:         ps.Symbol,
		Qty:            &qty,
		Side:           alpaca.Sell,
		Type:           alpaca.Stop,
		TimeInForce:    alpaca.Day,
		StopPrice:      &ps.StopPrice,
		PositionIntent: alpaca.SellToClose,
	}

	if ps.LimitPrice != nil {
		orderReq.Type = alpaca.StopLimit
		orderReq.LimitPrice = ps.LimitPrice
	}

	order, err := om.trading.PlaceOrder(orderReq)
	if err != nil {
		log.Printf("Failed to place stop-loss: %v", err)
		return
	}

	log.Printf("Stop-loss placed: id=%s symbol=%s stop=%s", order.ID, ps.Symbol, ps.StopPrice)
	if om.OnStopPlaced != nil {
		om.OnStopPlaced(ps.EntryOrderID, order)
	}
}

func (om *OrderManager) placeSafetyNetStop(ts *TrailingStop) {
	qty := decimal.NewFromInt(int64(ts.Qty))

	orderReq := alpaca.PlaceOrderRequest{
		Symbol:         ts.Symbol,
		Qty:            &qty,
		Side:           alpaca.Sell,
		Type:           alpaca.Stop,
		TimeInForce:    alpaca.Day,
		StopPrice:      &ts.SafetyStop,
		PositionIntent: alpaca.SellToClose,
	}

	order, err := om.trading.PlaceOrder(orderReq)
	if err != nil {
		log.Printf("Failed to place safety-net stop: %v", err)
		return
	}
	log.Printf("Safety-net stop placed: id=%s symbol=%s stop=%s", order.ID, ts.Symbol, ts.SafetyStop)

	om.mu.Lock()
	ts.SafetyOrderID = order.ID
	om.mu.Unlock()

	if om.OnStopPlaced != nil {
		om.OnStopPlaced(ts.OrderID, order)
	}
}

func (om *OrderManager) GetActiveTrailingStops() []*TrailingStop {
	om.mu.Lock()
	defer om.mu.Unlock()
	var stops []*TrailingStop
	for _, ts := range om.trailingStops {
		if ts.Active {
			stops = append(stops, ts)
		}
	}
	return stops
}

func (om *OrderManager) GetAllTrailingStops() []*TrailingStop {
	om.mu.Lock()
	defer om.mu.Unlock()
	var stops []*TrailingStop
	for _, ts := range om.trailingStops {
		stops = append(stops, ts)
	}
	return stops
}
