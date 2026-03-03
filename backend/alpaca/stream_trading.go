package alpaca

import (
	"context"
	"log"

	alpacaAPI "github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
)

type TradingStream struct {
	client      *alpacaAPI.Client
	OnUpdate    func(alpacaAPI.TradeUpdate)
}

func NewTradingStream(client *alpacaAPI.Client) *TradingStream {
	return &TradingStream{client: client}
}

func (ts *TradingStream) Start(ctx context.Context) {
	ts.client.StreamTradeUpdatesInBackground(ctx, func(tu alpacaAPI.TradeUpdate) {
		log.Printf("Trade update: event=%s symbol=%s order_id=%s", tu.Event, tu.Order.Symbol, tu.Order.ID)
		if ts.OnUpdate != nil {
			ts.OnUpdate(tu)
		}
	})
}
