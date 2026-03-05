package orders

import (
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
	log.Printf("Trailing stop registered: order=%s symbol=%s entry=%s startPct=%s offsetPct=%s",
		ts.OrderID, ts.Symbol, ts.EntryPrice, ts.StartPercent, ts.OffsetPercent)
}

// UpdatePrice is called on every option quote.
//
// Alpaca does NOT support stop orders on options, so this engine manages
// the trailing stop entirely in software:
//
// Phase 1 (inactive): wait for price >= entry*(1+startPercent), then activate.
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
			// Phase 1: waiting for start threshold
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
	qty := decimal.NewFromInt(int64(ts.Qty))
	order, err := tse.trading.ClosePosition(ts.Symbol, alpaca.ClosePositionRequest{
		Qty: qty,
	})
	if err != nil {
		log.Printf("Trailing stop close failed: %v", err)
		// Allow retry on next quote
		tse.mu.Lock()
		ts.Fired = false
		ts.Active = true
		tse.mu.Unlock()
		return
	}

	log.Printf("Trailing stop closed position: order=%s symbol=%s closeOrderId=%s", ts.OrderID, ts.Symbol, order.ID)

	tse.mu.Lock()
	delete(tse.stops, ts.OrderID)
	tse.mu.Unlock()

	if tse.OnFired != nil {
		tse.OnFired(ts)
	}
}

func (tse *TrailingStopEngine) Remove(orderID string) {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	delete(tse.stops, orderID)
}
