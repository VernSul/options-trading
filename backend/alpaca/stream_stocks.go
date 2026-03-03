package alpaca

import (
	"context"
	"log"

	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata/stream"
)

type StockStream struct {
	client  *stream.StocksClient
	OnBar   func(stream.Bar)
	OnQuote func(stream.Quote)
}

func NewStockStream(apiKey, apiSecret string) *StockStream {
	ss := &StockStream{}
	ss.client = stream.NewStocksClient(
		marketdata.IEX,
		stream.WithCredentials(apiKey, apiSecret),
	)
	return ss
}

func (ss *StockStream) Connect(ctx context.Context) error {
	if err := ss.client.Connect(ctx); err != nil {
		return err
	}
	go func() {
		if err := <-ss.client.Terminated(); err != nil {
			log.Printf("Stock stream terminated: %v", err)
		}
	}()
	return nil
}

func (ss *StockStream) SubscribeToBars(symbols ...string) error {
	return ss.client.SubscribeToBars(func(b stream.Bar) {
		if ss.OnBar != nil {
			ss.OnBar(b)
		}
	}, symbols...)
}

func (ss *StockStream) UnsubscribeFromBars(symbols ...string) error {
	return ss.client.UnsubscribeFromBars(symbols...)
}

func (ss *StockStream) SubscribeToQuotes(symbols ...string) error {
	return ss.client.SubscribeToQuotes(func(q stream.Quote) {
		if ss.OnQuote != nil {
			ss.OnQuote(q)
		}
	}, symbols...)
}

func (ss *StockStream) UnsubscribeFromQuotes(symbols ...string) error {
	return ss.client.UnsubscribeFromQuotes(symbols...)
}
