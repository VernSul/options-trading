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

	// When trailing is enabled, use its safetyStop as the initial stop price.
	// Don't queue a separate pendingStop — trailing owns the stop order.
	if req.TrailingStop != nil {
		ts := &TrailingStop{
			OrderID:       order.ID,
			Symbol:        req.Symbol,
			Qty:           req.Qty,
			TrailAmount:   req.TrailingStop.TrailAmount,
			EntryPrice:    decimal.Zero, // set on fill
			StartPercent:  req.TrailingStop.StartPercent,
			OffsetPercent: req.TrailingStop.OffsetPercent,
			Active:        false,
		}
		om.trailingStops[order.ID] = ts

		// Use safetyStop as initial stop price
		om.pendingStops[order.ID] = &PendingStopLoss{
			EntryOrderID: order.ID,
			Symbol:       req.Symbol,
			Qty:          req.Qty,
			StopPrice:    req.TrailingStop.SafetyStop,
		}

		log.Printf("Queued trailing stop for order %s startPercent=%s offsetPercent=%s initialStop=%s",
			order.ID, req.TrailingStop.StartPercent, req.TrailingStop.OffsetPercent, req.TrailingStop.SafetyStop)
	} else if req.StopLoss != nil {
		// Standalone stop-loss (no trailing)
		om.pendingStops[order.ID] = &PendingStopLoss{
			EntryOrderID: order.ID,
			Symbol:       req.Symbol,
			Qty:          req.Qty,
			StopPrice:    req.StopLoss.StopPrice,
			LimitPrice:   req.StopLoss.LimitPrice,
		}
		log.Printf("Queued stop-loss for order %s at %s", order.ID, req.StopLoss.StopPrice)
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

	// Always place the stop order on fill
	if pendingStop != nil {
		om.placeInitialStop(pendingStop, trailingStop)
	}

	// Register trailing stop with engine (after stop is placed)
	if trailingStop != nil && om.OnTrailingInit != nil {
		om.OnTrailingInit(trailingStop)
	}
}

// placeInitialStop places the stop-loss order on Alpaca. If a trailing stop is
// also configured, the stop order ID is stored on the TrailingStop so the engine
// can cancel+replace it as the high-water mark moves.
func (om *OrderManager) placeInitialStop(ps *PendingStopLoss, ts *TrailingStop) {
	qty := decimal.NewFromInt(int64(ps.Qty))

	orderReq := alpaca.PlaceOrderRequest{
		Symbol:         ps.Symbol,
		Qty:            &qty,
		Side:           alpaca.Sell,
		Type:           alpaca.Stop,
		TimeInForce:    alpaca.GTC,
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

	// If trailing is attached, store the stop order ID so the engine can move it
	if ts != nil {
		om.mu.Lock()
		ts.StopOrderID = order.ID
		om.mu.Unlock()
	}

	if om.OnStopPlaced != nil {
		om.OnStopPlaced(ps.EntryOrderID, order)
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
