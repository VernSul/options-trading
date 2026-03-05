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
	OnFired  func(ts *TrailingStop, closeOrder *alpaca.Order)
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
	log.Printf("Trailing stop registered: order=%s symbol=%s entry=%s startPct=%s offsetPct=%s active=%v",
		ts.OrderID, ts.Symbol, ts.EntryPrice, ts.StartPercent, ts.OffsetPercent, ts.Active)
}

// UpdatePrice is called on every option quote to check trailing stop state.
// Phase 1 (inactive): wait for price to reach entry * (1 + startPercent), then activate.
// Phase 2 (active): track high-water mark, fire when price drops offsetPercent below high-water.
func (tse *TrailingStopEngine) UpdatePrice(symbol string, midPrice decimal.Decimal) {
	tse.mu.Lock()
	defer tse.mu.Unlock()

	for _, ts := range tse.stops {
		if ts.Symbol != symbol {
			continue
		}

		// Skip if already fired (waiting for removal)
		if ts.Fired {
			continue
		}

		if !ts.Active {
			// Phase 1: waiting for start threshold
			if ts.EntryPrice.IsZero() {
				continue // not yet filled
			}
			one := decimal.NewFromInt(1)
			activationPrice := ts.EntryPrice.Mul(one.Add(ts.StartPercent))
			if midPrice.GreaterThanOrEqual(activationPrice) {
				ts.Active = true
				ts.HighWater = midPrice
				log.Printf("Trailing stop activated: order=%s symbol=%s mid=%s entry=%s threshold=%s",
					ts.OrderID, ts.Symbol, midPrice, ts.EntryPrice, activationPrice)
				if tse.OnUpdate != nil {
					tse.OnUpdate(ts)
				}
			}
			continue
		}

		// Phase 2: active trailing
		// Update high water mark
		if midPrice.GreaterThan(ts.HighWater) {
			ts.HighWater = midPrice
			if tse.OnUpdate != nil {
				tse.OnUpdate(ts)
			}
		}

		// Trigger = highWater * (1 - offsetPercent)
		one := decimal.NewFromInt(1)
		triggerPrice := ts.HighWater.Mul(one.Sub(ts.OffsetPercent))
		if midPrice.LessThanOrEqual(triggerPrice) {
			log.Printf("Trailing stop triggered: symbol=%s mid=%s highwater=%s trigger=%s offsetPct=%s",
				ts.Symbol, midPrice, ts.HighWater, triggerPrice, ts.OffsetPercent)
			ts.Active = false
			ts.Fired = true // prevent re-activation
			go tse.fireClose(ts)
		}
	}
}

func (tse *TrailingStopEngine) fireClose(ts *TrailingStop) {
	// Use ClosePosition instead of PlaceOrder to avoid "uncovered option" errors.
	// ClosePosition handles the sell side automatically.
	qty := decimal.NewFromInt(int64(ts.Qty))
	order, err := tse.trading.ClosePosition(ts.Symbol, alpaca.ClosePositionRequest{
		Qty: qty,
	})
	if err != nil {
		log.Printf("Trailing stop close via ClosePosition failed: %v", err)
		// Fallback: try PlaceOrder with BuyToClose in case it's a short position,
		// or the symbol format differs
		order, err = tse.trading.PlaceOrder(alpaca.PlaceOrderRequest{
			Symbol:         ts.Symbol,
			Qty:            &qty,
			Side:           alpaca.Sell,
			Type:           alpaca.Market,
			TimeInForce:    alpaca.Day,
			PositionIntent: alpaca.SellToClose,
		})
		if err != nil {
			log.Printf("Trailing stop close fallback also failed: %v", err)
			// Mark as not fired so it can retry on next trigger
			tse.mu.Lock()
			ts.Fired = false
			ts.Active = false
			tse.mu.Unlock()
			return
		}
	}

	log.Printf("Trailing stop close order placed: id=%s symbol=%s", order.ID, ts.Symbol)

	// Cancel safety-net stop on Alpaca to prevent double-close
	if ts.SafetyOrderID != "" {
		if cancelErr := tse.trading.CancelOrder(ts.SafetyOrderID); cancelErr != nil {
			log.Printf("Failed to cancel safety-net stop %s: %v", ts.SafetyOrderID, cancelErr)
		} else {
			log.Printf("Cancelled safety-net stop: id=%s", ts.SafetyOrderID)
		}
	}

	// Remove from engine — this trailing stop is done
	tse.mu.Lock()
	delete(tse.stops, ts.OrderID)
	tse.mu.Unlock()

	if tse.OnFired != nil {
		tse.OnFired(ts, order)
	}
}

func (tse *TrailingStopEngine) Remove(orderID string) {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	delete(tse.stops, orderID)
}

// CancelSafetyStop cancels the safety-net stop order on Alpaca for a given trailing stop.
func (tse *TrailingStopEngine) CancelSafetyStop(orderID string) error {
	tse.mu.Lock()
	ts, ok := tse.stops[orderID]
	tse.mu.Unlock()
	if !ok {
		return fmt.Errorf("trailing stop not found: %s", orderID)
	}
	if ts.SafetyOrderID == "" {
		return nil
	}
	return tse.trading.CancelOrder(ts.SafetyOrderID)
}
