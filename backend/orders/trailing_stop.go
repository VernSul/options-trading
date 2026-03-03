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
	log.Printf("Trailing stop registered: order=%s symbol=%s trail=%s highwater=%s",
		ts.OrderID, ts.Symbol, ts.TrailAmount, ts.HighWater)
}

// UpdatePrice is called on every option quote to check if trailing stop should fire.
func (tse *TrailingStopEngine) UpdatePrice(symbol string, midPrice decimal.Decimal) {
	tse.mu.Lock()
	defer tse.mu.Unlock()

	for _, ts := range tse.stops {
		if ts.Symbol != symbol || !ts.Active {
			continue
		}

		// Update high water mark
		if midPrice.GreaterThan(ts.HighWater) {
			ts.HighWater = midPrice
			if tse.OnUpdate != nil {
				tse.OnUpdate(ts)
			}
		}

		// Check if price dropped below trail
		triggerPrice := ts.HighWater.Sub(ts.TrailAmount)
		if midPrice.LessThanOrEqual(triggerPrice) {
			log.Printf("Trailing stop triggered: symbol=%s mid=%s highwater=%s trail=%s",
				ts.Symbol, midPrice, ts.HighWater, ts.TrailAmount)
			ts.Active = false
			go tse.fireClose(ts)
		}
	}
}

func (tse *TrailingStopEngine) fireClose(ts *TrailingStop) {
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
		return
	}

	log.Printf("Trailing stop close order placed: id=%s symbol=%s", order.ID, ts.Symbol)
	if tse.OnFired != nil {
		tse.OnFired(ts, order)
	}
}

func (tse *TrailingStopEngine) Remove(orderID string) {
	tse.mu.Lock()
	defer tse.mu.Unlock()
	delete(tse.stops, orderID)
}
