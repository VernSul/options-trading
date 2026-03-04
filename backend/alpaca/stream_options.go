package alpaca

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata/stream"
)

type OptionStream struct {
	apiKey    string
	apiSecret string
	client    *stream.OptionClient
	mu        sync.Mutex
	quoteSubs map[string]bool
	OnQuote   func(stream.OptionQuote)
	OnTrade   func(stream.OptionTrade)
}

func NewOptionStream(apiKey, apiSecret string) *OptionStream {
	os := &OptionStream{
		apiKey:    apiKey,
		apiSecret: apiSecret,
		quoteSubs: make(map[string]bool),
	}
	os.client = stream.NewOptionClient(
		marketdata.OptionFeed("indicative"),
		stream.WithCredentials(apiKey, apiSecret),
		stream.WithReconnectSettings(0, 250*time.Millisecond),
	)
	return os
}

func (os *OptionStream) Connect(ctx context.Context) error {
	if err := os.client.Connect(ctx); err != nil {
		return err
	}
	go os.watchTerminated(ctx)
	return nil
}

func (os *OptionStream) watchTerminated(ctx context.Context) {
	if err := <-os.client.Terminated(); err != nil {
		log.Printf("Option stream terminated: %v — recreating client", err)
	} else {
		log.Println("Option stream terminated cleanly — recreating client")
	}

	select {
	case <-ctx.Done():
		return
	default:
	}

	os.mu.Lock()
	os.client = stream.NewOptionClient(
		marketdata.OptionFeed("indicative"),
		stream.WithCredentials(os.apiKey, os.apiSecret),
		stream.WithReconnectSettings(0, 250*time.Millisecond),
	)
	quoteSyms := make([]string, 0, len(os.quoteSubs))
	for sym := range os.quoteSubs {
		quoteSyms = append(quoteSyms, sym)
	}
	client := os.client
	os.mu.Unlock()

	if err := client.Connect(ctx); err != nil {
		log.Printf("Option stream reconnect failed: %v", err)
		return
	}

	if len(quoteSyms) > 0 {
		if err := os.SubscribeToQuotes(quoteSyms...); err != nil {
			log.Printf("Option stream re-subscribe quotes failed: %v", err)
		}
	}

	log.Println("Option stream reconnected and re-subscribed")
	go os.watchTerminated(ctx)
}

func (os *OptionStream) SubscribeToQuotes(symbols ...string) error {
	os.mu.Lock()
	for _, sym := range symbols {
		os.quoteSubs[sym] = true
	}
	os.mu.Unlock()

	return os.client.SubscribeToQuotes(func(q stream.OptionQuote) {
		if os.OnQuote != nil {
			os.OnQuote(q)
		}
	}, symbols...)
}

func (os *OptionStream) UnsubscribeFromQuotes(symbols ...string) error {
	os.mu.Lock()
	for _, sym := range symbols {
		delete(os.quoteSubs, sym)
	}
	os.mu.Unlock()

	return os.client.UnsubscribeFromQuotes(symbols...)
}
