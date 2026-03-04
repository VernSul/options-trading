package alpaca

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata/stream"
)

type StockStream struct {
	apiKey    string
	apiSecret string
	client    *stream.StocksClient
	mu        sync.Mutex
	barSubs   map[string]bool
	quoteSubs map[string]bool
	OnBar     func(stream.Bar)
	OnQuote   func(stream.Quote)
}

func NewStockStream(apiKey, apiSecret string) *StockStream {
	ss := &StockStream{
		apiKey:    apiKey,
		apiSecret: apiSecret,
		barSubs:   make(map[string]bool),
		quoteSubs: make(map[string]bool),
	}
	ss.client = stream.NewStocksClient(
		marketdata.IEX,
		stream.WithCredentials(apiKey, apiSecret),
		stream.WithReconnectSettings(0, 250*time.Millisecond),
	)
	return ss
}

func (ss *StockStream) Connect(ctx context.Context) error {
	if err := ss.client.Connect(ctx); err != nil {
		return err
	}
	go ss.watchTerminated(ctx)
	return nil
}

func (ss *StockStream) watchTerminated(ctx context.Context) {
	if err := <-ss.client.Terminated(); err != nil {
		log.Printf("Stock stream terminated: %v — recreating client", err)
	} else {
		log.Println("Stock stream terminated cleanly — recreating client")
	}

	select {
	case <-ctx.Done():
		return
	default:
	}

	// Recreate the client and restore subscriptions
	ss.mu.Lock()
	ss.client = stream.NewStocksClient(
		marketdata.IEX,
		stream.WithCredentials(ss.apiKey, ss.apiSecret),
		stream.WithReconnectSettings(0, 250*time.Millisecond),
	)
	barSyms := make([]string, 0, len(ss.barSubs))
	for sym := range ss.barSubs {
		barSyms = append(barSyms, sym)
	}
	quoteSyms := make([]string, 0, len(ss.quoteSubs))
	for sym := range ss.quoteSubs {
		quoteSyms = append(quoteSyms, sym)
	}
	client := ss.client
	ss.mu.Unlock()

	if err := client.Connect(ctx); err != nil {
		log.Printf("Stock stream reconnect failed: %v", err)
		return
	}

	// Re-subscribe
	if len(barSyms) > 0 {
		if err := ss.SubscribeToBars(barSyms...); err != nil {
			log.Printf("Stock stream re-subscribe bars failed: %v", err)
		}
	}
	if len(quoteSyms) > 0 {
		if err := ss.SubscribeToQuotes(quoteSyms...); err != nil {
			log.Printf("Stock stream re-subscribe quotes failed: %v", err)
		}
	}

	log.Println("Stock stream reconnected and re-subscribed")
	go ss.watchTerminated(ctx)
}

func (ss *StockStream) SubscribeToBars(symbols ...string) error {
	ss.mu.Lock()
	for _, sym := range symbols {
		ss.barSubs[sym] = true
	}
	ss.mu.Unlock()

	return ss.client.SubscribeToBars(func(b stream.Bar) {
		if ss.OnBar != nil {
			ss.OnBar(b)
		}
	}, symbols...)
}

func (ss *StockStream) UnsubscribeFromBars(symbols ...string) error {
	ss.mu.Lock()
	for _, sym := range symbols {
		delete(ss.barSubs, sym)
	}
	ss.mu.Unlock()

	return ss.client.UnsubscribeFromBars(symbols...)
}

func (ss *StockStream) SubscribeToQuotes(symbols ...string) error {
	ss.mu.Lock()
	for _, sym := range symbols {
		ss.quoteSubs[sym] = true
	}
	ss.mu.Unlock()

	return ss.client.SubscribeToQuotes(func(q stream.Quote) {
		if ss.OnQuote != nil {
			ss.OnQuote(q)
		}
	}, symbols...)
}

func (ss *StockStream) UnsubscribeFromQuotes(symbols ...string) error {
	ss.mu.Lock()
	for _, sym := range symbols {
		delete(ss.quoteSubs, sym)
	}
	ss.mu.Unlock()

	return ss.client.UnsubscribeFromQuotes(symbols...)
}
