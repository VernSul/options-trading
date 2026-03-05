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

type pendingTakeProfit struct {
	symbol     string
	qty        int
	limitPrice decimal.Decimal // computed target price (entry * (1 + pct))
}

type OrderManager struct {
	mu             sync.Mutex
	trading        *alpaca.Client
	trailingStops  map[string]*TrailingStop  // entryOrderID -> trailing stop
	takeProfits    map[string]pendingTakeProfit // entryOrderID -> pending take profit
	earlyFills     map[string]pendingFill    // fills that arrived before config was stored
	OnTrailingInit func(ts *TrailingStop)
	OnTakeProfitPlaced func(symbol string, limitPrice decimal.Decimal, orderID string)
}

func NewOrderManager(trading *alpaca.Client) *OrderManager {
	return &OrderManager{
		trading:       trading,
		trailingStops: make(map[string]*TrailingStop),
		takeProfits:   make(map[string]pendingTakeProfit),
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

	// Software-managed stops (Alpaca doesn't support stop orders on options)
	if req.TrailingStop != nil {
		om.trailingStops[order.ID] = &TrailingStop{
			OrderID:       order.ID,
			Symbol:        req.Symbol,
			Qty:           req.Qty,
			TrailAmount:   req.TrailingStop.TrailAmount,
			SafetyStop:    req.TrailingStop.SafetyStop,
			EntryPrice:    decimal.Zero, // set on fill
			StartPercent:  req.TrailingStop.StartPercent,
			OffsetPercent: req.TrailingStop.OffsetPercent,
			Active:        false,
		}
		log.Printf("Queued trailing stop for order %s safetyStop=%s startPercent=%s offsetPercent=%s",
			order.ID, req.TrailingStop.SafetyStop, req.TrailingStop.StartPercent, req.TrailingStop.OffsetPercent)
	} else if req.StopLoss != nil {
		// Standalone stop-loss: use the trailing engine with only a safety stop
		om.trailingStops[order.ID] = &TrailingStop{
			OrderID:       order.ID,
			Symbol:        req.Symbol,
			Qty:           req.Qty,
			SafetyStop:    req.StopLoss.StopPrice,
			EntryPrice:    decimal.Zero, // set on fill
			StartPercent:  decimal.NewFromInt(999), // never activates trailing
			OffsetPercent: decimal.Zero,
			Active:        false,
		}
		log.Printf("Queued stop-loss for order %s stopPrice=%s", order.ID, req.StopLoss.StopPrice)
	}

	// Take profit: place limit sell-to-close on fill
	if req.TakeProfit != nil {
		om.takeProfits[order.ID] = pendingTakeProfit{
			symbol:     req.Symbol,
			qty:        req.Qty,
			limitPrice: req.TakeProfit.LimitPrice,
		}
		log.Printf("Queued take-profit for order %s limitPrice=%s", order.ID, req.TakeProfit.LimitPrice)
	}

	// Check if a fill already arrived while we were placing the order
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

	var trailingStop *TrailingStop
	if ts, ok := om.trailingStops[orderID]; ok {
		ts.EntryPrice = filledPrice
		ts.Active = false
		trailingStop = ts
	}

	var tp *pendingTakeProfit
	if t, ok := om.takeProfits[orderID]; ok {
		tp = &t
		delete(om.takeProfits, orderID)
	}

	// If no trailing stop and no take profit configured, buffer as early fill
	if trailingStop == nil && tp == nil {
		om.earlyFills[orderID] = pendingFill{orderID: orderID, filledPrice: filledPrice}
		om.mu.Unlock()
		log.Printf("Fill arrived before config stored, buffering: order=%s price=%s", orderID, filledPrice)
		return
	}

	om.mu.Unlock()

	// Register trailing/stop-loss with engine
	if trailingStop != nil {
		log.Printf("Entry filled: order=%s symbol=%s price=%s — registering trailing stop",
			orderID, trailingStop.Symbol, filledPrice)
		if om.OnTrailingInit != nil {
			om.OnTrailingInit(trailingStop)
		}
	}

	// Place take-profit limit sell-to-close order
	if tp != nil {
		om.placeTakeProfit(orderID, tp)
	}
}

func (om *OrderManager) placeTakeProfit(entryOrderID string, tp *pendingTakeProfit) {
	qty := decimal.NewFromInt(int64(tp.qty))
	limitPrice := tp.limitPrice

	order, err := om.trading.PlaceOrder(alpaca.PlaceOrderRequest{
		Symbol:         tp.symbol,
		Qty:            &qty,
		Side:           alpaca.Sell,
		Type:           alpaca.Limit,
		TimeInForce:    alpaca.Day,
		LimitPrice:     &limitPrice,
		PositionIntent: alpaca.SellToClose,
	})
	if err != nil {
		log.Printf("Take-profit order failed: entry=%s symbol=%s limit=%s err=%v",
			entryOrderID, tp.symbol, limitPrice, err)
		return
	}

	log.Printf("Take-profit placed: entry=%s symbol=%s limit=%s tpOrderId=%s",
		entryOrderID, tp.symbol, limitPrice, order.ID)

	if om.OnTakeProfitPlaced != nil {
		om.OnTakeProfitPlaced(tp.symbol, limitPrice, order.ID)
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
