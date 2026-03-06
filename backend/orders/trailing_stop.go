package orders

import (
	"log"
	"sync"

	"github.com/shopspring/decimal"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
)

type TrailingStopEngine struct {
	mu          sync.Mutex
	trading     *alpaca.Client
	stops       map[string]*TrailingStop // orderID -> trailing stop
	exitReasons map[string]string        // closeOrderID -> exit reason
	OnFired     func(ts *TrailingStop)
	OnUpdate    func(ts *TrailingStop)
}

func NewTrailingStopEngine(trading *alpaca.Client) *TrailingStopEngine {
	return &TrailingStopEngine{
		trading:     trading,
		stops:       make(map[string]*TrailingStop),
		exitReasons: make(map[string]string),
	}
}

func (tse *TrailingStopEngine) Register(ts *TrailingStop) {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	tse.stops[ts.OrderID] = ts
	log.Printf("Trailing stop registered: order=%s symbol=%s entry=%s safetyStop=%s startPct=%s offsetPct=%s",
		ts.OrderID, ts.Symbol, ts.EntryPrice, ts.SafetyStop, ts.StartPercent, ts.OffsetPercent)
}

// UpdatePrice is called on every option quote.
//
// Alpaca does NOT support stop orders on options, so this engine manages
// the trailing stop entirely in software:
//
// Phase 1 (inactive): safety stop protects against loss. If price drops
//
//	to safetyStop, close immediately. Otherwise wait for
//	price >= entry*(1+startPercent), then activate trailing.
//
// Phase 2 (active): track high-water mark + computed stop price.
//
//	When price drops to stopPrice = highWater*(1-offsetPercent), close
//	the position via ClosePosition.
func (tse *TrailingStopEngine) UpdatePrice(symbol string, midPrice decimal.Decimal) {
	tse.mu.Lock()

	var toClose *TrailingStop

	for _, ts := range tse.stops {
		if ts.Symbol != symbol || ts.Fired {
			continue
		}
		if ts.EntryPrice.IsZero() {
			continue
		}

		one := decimal.NewFromInt(1)

		if !ts.Active {
			// Phase 1: waiting for start threshold — safety stop protects against loss
			if !ts.SafetyStop.IsZero() && midPrice.LessThanOrEqual(ts.SafetyStop) {
				log.Printf("Safety stop triggered: order=%s symbol=%s mid=%s safetyStop=%s",
					ts.OrderID, ts.Symbol, midPrice, ts.SafetyStop)
				ts.Fired = true
				ts.StopPrice = ts.SafetyStop
				ts.ExitReason = "stop_loss"
				toClose = ts
				break
			}

			activationPrice := ts.EntryPrice.Mul(one.Add(ts.StartPercent))
			if midPrice.GreaterThanOrEqual(activationPrice) {
				ts.Active = true
				ts.HighWater = midPrice
				ts.StopPrice = ts.HighWater.Mul(one.Sub(ts.OffsetPercent))
				log.Printf("Trailing stop activated: order=%s symbol=%s mid=%s entry=%s threshold=%s stopPrice=%s",
					ts.OrderID, ts.Symbol, midPrice, ts.EntryPrice, activationPrice, ts.StopPrice)
				if tse.OnUpdate != nil {
					tse.OnUpdate(ts)
				}
			}
			continue
		}

		// Phase 2: active trailing
		if midPrice.GreaterThan(ts.HighWater) {
			ts.HighWater = midPrice
			ts.StopPrice = ts.HighWater.Mul(one.Sub(ts.OffsetPercent))
			log.Printf("Trailing HW update: order=%s symbol=%s mid=%s newHW=%s newStop=%s",
				ts.OrderID, ts.Symbol, midPrice, ts.HighWater, ts.StopPrice)
			if tse.OnUpdate != nil {
				tse.OnUpdate(ts)
			}
		}

		// Check if price dropped to stop level
		if midPrice.LessThanOrEqual(ts.StopPrice) {
			log.Printf("Trailing stop triggered: order=%s symbol=%s mid=%s stopPrice=%s HW=%s",
				ts.OrderID, ts.Symbol, midPrice, ts.StopPrice, ts.HighWater)
			ts.Fired = true
			ts.Active = false
			ts.ExitReason = "trailing"
			toClose = ts
			break // only one close at a time
		}
	}

	tse.mu.Unlock()

	if toClose != nil {
		tse.fireClose(toClose)
	}
}

func (tse *TrailingStopEngine) fireClose(ts *TrailingStop) {
	// Remember pre-fire state so we can restore correctly on failure
	wasActive := ts.ExitReason == "trailing"

	// Cancel any existing orders for this symbol (e.g. take-profit limit orders)
	// that would conflict with our market sell-to-close
	tse.cancelOrdersForSymbol(ts.Symbol)

	qty := decimal.NewFromInt(int64(ts.Qty))
	order, err := tse.trading.PlaceOrder(alpaca.PlaceOrderRequest{
		Symbol:         ts.Symbol,
		Qty:            &qty,
		Side:           alpaca.Sell,
		Type:           alpaca.Market,
		TimeInForce:    alpaca.Day,
		PositionIntent: alpaca.SellToClose,
	})
	if err != nil {
		log.Printf("Trailing stop close failed: %v", err)
		// Allow retry on next quote — restore to correct phase
		tse.mu.Lock()
		ts.Fired = false
		ts.Active = wasActive // safety stop was Phase 1 (Active=false), trailing was Phase 2 (Active=true)
		tse.mu.Unlock()
		return
	}

	log.Printf("Trailing stop closed position: order=%s symbol=%s closeOrderId=%s reason=%s", ts.OrderID, ts.Symbol, order.ID, ts.ExitReason)

	tse.mu.Lock()
	delete(tse.stops, ts.OrderID)
	tse.exitReasons[order.ID] = ts.ExitReason
	tse.mu.Unlock()

	if tse.OnFired != nil {
		tse.OnFired(ts)
	}
}

// cancelOrdersForSymbol cancels all open orders for a symbol.
// This is needed before placing a close order because Alpaca rejects
// a sell-to-close if there's already a pending sell-to-close (e.g. take-profit).
func (tse *TrailingStopEngine) cancelOrdersForSymbol(symbol string) {
	orders, err := tse.trading.GetOrders(alpaca.GetOrdersRequest{
		Status:  "open",
		Symbols: []string{symbol},
		Limit:   50,
	})
	if err != nil {
		log.Printf("Failed to get orders for %s: %v", symbol, err)
		return
	}
	for _, o := range orders {
		if err := tse.trading.CancelOrder(o.ID); err != nil {
			log.Printf("Failed to cancel order %s for %s: %v", o.ID, symbol, err)
		} else {
			log.Printf("Cancelled order %s (%s) for stop close of %s", o.ID, o.Type, symbol)
		}
	}
}

func (tse *TrailingStopEngine) Remove(orderID string) {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	delete(tse.stops, orderID)
}

// RemoveBySymbol removes all stops for a given symbol and returns removed stops.
// Called when a position is closed externally (manual, take-profit, etc.)
func (tse *TrailingStopEngine) RemoveBySymbol(symbol string) []*TrailingStop {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	var removed []*TrailingStop
	for id, ts := range tse.stops {
		if ts.Symbol == symbol {
			log.Printf("Removing stop for closed position: order=%s symbol=%s", id, symbol)
			removed = append(removed, ts)
			delete(tse.stops, id)
		}
	}
	return removed
}

// GetAll returns all currently tracked stops (active, inactive, and standalone stop-losses).
func (tse *TrailingStopEngine) GetAll() []*TrailingStop {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	var result []*TrailingStop
	for _, ts := range tse.stops {
		result = append(result, ts)
	}
	return result
}

// GetExitReason returns the exit reason for a close order ID (trailing, stop_loss, or empty for manual).
func (tse *TrailingStopEngine) GetExitReason(closeOrderID string) string {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	return tse.exitReasons[closeOrderID]
}
