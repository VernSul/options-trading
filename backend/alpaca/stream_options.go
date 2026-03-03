package alpaca

import (
	"context"
	"log"

	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata/stream"
)

type OptionStream struct {
	client  *stream.OptionClient
	OnQuote func(stream.OptionQuote)
	OnTrade func(stream.OptionTrade)
}

func NewOptionStream(apiKey, apiSecret string) *OptionStream {
	os := &OptionStream{}
	os.client = stream.NewOptionClient(
		marketdata.OptionFeed("indicative"),
		stream.WithCredentials(apiKey, apiSecret),
	)
	return os
}

func (os *OptionStream) Connect(ctx context.Context) error {
	if err := os.client.Connect(ctx); err != nil {
		return err
	}
	go func() {
		if err := <-os.client.Terminated(); err != nil {
			log.Printf("Option stream terminated: %v", err)
		}
	}()
	return nil
}

func (os *OptionStream) SubscribeToQuotes(symbols ...string) error {
	return os.client.SubscribeToQuotes(func(q stream.OptionQuote) {
		if os.OnQuote != nil {
			os.OnQuote(q)
		}
	}, symbols...)
}

func (os *OptionStream) UnsubscribeFromQuotes(symbols ...string) error {
	return os.client.UnsubscribeFromQuotes(symbols...)
}
