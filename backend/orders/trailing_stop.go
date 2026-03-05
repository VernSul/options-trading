package orders

import (
	"fmt"
	"log"
	"sync"

	"github.com/shopspring/decimal"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
)

type TrailingStopEngine struct {
	mu       sync.Mutex
	trading  *alpaca.Client
	stops    map[string]*TrailingStop // orderID -> trailing stop
	OnFired  func(ts *TrailingStop)
	OnUpdate func(ts *TrailingStop)
}

func NewTrailingStopEngine(trading *alpaca.Client) *TrailingStopEngine {
	return &TrailingStopEngine{
		trading: trading,
		stops:   make(map[string]*TrailingStop),
	}
}

func (tse *TrailingStopEngine) Register(ts *TrailingStop) {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	tse.stops[ts.OrderID] = ts
	log.Printf("Trailing stop registered: order=%s symbol=%s entry=%s startPct=%s offsetPct=%s stopOrderID=%s",
		ts.OrderID, ts.Symbol, ts.EntryPrice, ts.StartPercent, ts.OffsetPercent, ts.StopOrderID)
}

// UpdatePrice is called on every option quote.
//
// Phase 1 (inactive): price hasn't reached entry*(1+startPercent) yet.
//   The initial stop-loss order is already on Alpaca. Wait.
//
// Phase 2 (active): price crossed the activation threshold.
//   Track high-water mark. Every time HW increases, cancel the old stop
//   order on Alpaca and place a new one at highWater*(1-offsetPercent).
//   Alpaca executes the stop when price drops — we don't need to.
func (tse *TrailingStopEngine) UpdatePrice(symbol string, midPrice decimal.Decimal) {
	tse.mu.Lock()
	defer tse.mu.Unlock()

	for _, ts := range tse.stops {
		if ts.Symbol != symbol || ts.Fired {
			continue
		}

		if ts.EntryPrice.IsZero() {
			continue // not yet filled
		}

		one := decimal.NewFromInt(1)

		if !ts.Active {
			// Phase 1: waiting for start threshold
			activationPrice := ts.EntryPrice.Mul(one.Add(ts.StartPercent))
			if midPrice.GreaterThanOrEqual(activationPrice) {
				ts.Active = true
				ts.HighWater = midPrice
				log.Printf("Trailing stop activated: order=%s symbol=%s mid=%s entry=%s threshold=%s",
					ts.OrderID, ts.Symbol, midPrice, ts.EntryPrice, activationPrice)

				// Move the stop order up to highWater*(1-offsetPercent)
				go tse.moveStop(ts, ts.HighWater.Mul(one.Sub(ts.OffsetPercent)))

				if tse.OnUpdate != nil {
					tse.OnUpdate(ts)
				}
			}
			continue
		}

		// Phase 2: active trailing — only act when high-water increases
		if midPrice.GreaterThan(ts.HighWater) {
			ts.HighWater = midPrice
			newStopPrice := ts.HighWater.Mul(one.Sub(ts.OffsetPercent))
			log.Printf("Trailing HW update: order=%s symbol=%s mid=%s newHW=%s newStop=%s",
				ts.OrderID, ts.Symbol, midPrice, ts.HighWater, newStopPrice)

			go tse.moveStop(ts, newStopPrice)

			if tse.OnUpdate != nil {
				tse.OnUpdate(ts)
			}
		}
	}
}

// moveStop cancels the current stop order on Alpaca and places a new one at newStopPrice.
func (tse *TrailingStopEngine) moveStop(ts *TrailingStop, newStopPrice decimal.Decimal) {
	tse.mu.Lock()
	oldOrderID := ts.StopOrderID
	tse.mu.Unlock()

	// Cancel old stop order
	if oldOrderID != "" {
		if err := tse.trading.CancelOrder(oldOrderID); err != nil {
			log.Printf("Trailing: failed to cancel old stop %s: %v", oldOrderID, err)
			// Continue anyway — place the new one; the old one may have already been
			// filled or canceled on Alpaca's side.
		} else {
			log.Printf("Trailing: cancelled old stop order %s", oldOrderID)
		}
	}

	// Place new stop order
	qty := decimal.NewFromInt(int64(ts.Qty))
	order, err := tse.trading.PlaceOrder(alpaca.PlaceOrderRequest{
		Symbol:         ts.Symbol,
		Qty:            &qty,
		Side:           alpaca.Sell,
		Type:           alpaca.Stop,
		TimeInForce:    alpaca.GTC,
		StopPrice:      &newStopPrice,
		PositionIntent: alpaca.SellToClose,
	})
	if err != nil {
		log.Printf("Trailing: failed to place new stop at %s: %v", newStopPrice, err)
		return
	}

	tse.mu.Lock()
	ts.StopOrderID = order.ID
	tse.mu.Unlock()

	log.Printf("Trailing: new stop placed id=%s symbol=%s stop=%s", order.ID, ts.Symbol, newStopPrice)
}

// HandleStopFilled is called when we detect that a trailing stop order was filled.
// This cleans up the trailing stop from the engine.
func (tse *TrailingStopEngine) HandleStopFilled(orderID string) {
	tse.mu.Lock()
	defer tse.mu.Unlock()

	for key, ts := range tse.stops {
		if ts.StopOrderID == orderID {
			ts.Fired = true
			ts.Active = false
			log.Printf("Trailing stop order filled: order=%s symbol=%s", orderID, ts.Symbol)
			delete(tse.stops, key)

			if tse.OnFired != nil {
				tse.OnFired(ts)
			}
			return
		}
	}
}

func (tse *TrailingStopEngine) Remove(orderID string) {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	delete(tse.stops, orderID)
}

// CancelSafetyStop cancels the current stop order on Alpaca for a given trailing stop.
func (tse *TrailingStopEngine) CancelSafetyStop(orderID string) error {
	tse.mu.Lock()
	ts, ok := tse.stops[orderID]
	tse.mu.Unlock()
	if !ok {
		return fmt.Errorf("trailing stop not found: %s", orderID)
	}
	if ts.StopOrderID == "" {
		return nil
	}
	return tse.trading.CancelOrder(ts.StopOrderID)
}
