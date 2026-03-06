package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	alpacaClient "options-trading/alpaca"
	"options-trading/api"
	"options-trading/config"
	"options-trading/finnhub"
	"options-trading/hub"
	"options-trading/orders"
	"options-trading/tiingo"

	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata/stream"
	"github.com/shopspring/decimal"

	alpacaAPI "github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
)

func main() {
	cfg := config.Load()

	if cfg.AlpacaAPIKey == "" || cfg.AlpacaAPISecret == "" {
		log.Fatal("ALPACA_API_KEY and ALPACA_API_SECRET must be set")
	}

	// Init clients
	client := alpacaClient.NewClient(cfg)

	// Verify connection
	account, err := client.Trading.GetAccount()
	if err != nil {
		log.Fatalf("Failed to connect to Alpaca: %v", err)
	}
	log.Printf("Connected to Alpaca: account=%s equity=%s buying_power=%s",
		account.AccountNumber, account.Equity, account.BuyingPower)

	// Init WS hub
	wsHub := hub.NewHub()
	go wsHub.Run()

	// Heartbeat
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		for range ticker.C {
			wsHub.BroadcastMessage(hub.MsgHeartbeat, map[string]interface{}{
				"time":    time.Now().UTC(),
				"clients": wsHub.ClientCount(),
			})
		}
	}()

	// Init streams (before wiring callbacks that reference them)
	ctx := context.Background()

	stockStream := alpacaClient.NewStockStream(cfg.AlpacaAPIKey, cfg.AlpacaAPISecret)
	optionStream := alpacaClient.NewOptionStream(cfg.AlpacaAPIKey, cfg.AlpacaAPISecret)
	tradingStream := alpacaClient.NewTradingStream(client.Trading)
	finnhubStream := finnhub.NewStream(cfg.FinnhubAPIKey)
	tiingoStream := tiingo.NewStream(cfg.TiingoAPIKey)

	// Init order manager
	orderMgr := orders.NewOrderManager(client.Trading)
	trailingEngine := orders.NewTrailingStopEngine(client.Trading)
	crossingEngine := orders.NewCrossingEngine(client.Trading)

	// Wire order manager callbacks
	orderMgr.OnTrailingInit = func(ts *orders.TrailingStop) {
		// Auto-subscribe to option quotes so the trailing engine receives price updates
		if err := optionStream.SubscribeToQuotes(ts.Symbol); err != nil {
			log.Printf("Warning: failed to subscribe to option quotes for trailing %s: %v", ts.Symbol, err)
		}
		trailingEngine.Register(ts)
		wsHub.BroadcastMessage(hub.MsgTrailingStopUpdate, ts)
	}

	trailingEngine.OnUpdate = func(ts *orders.TrailingStop) {
		wsHub.BroadcastMessage(hub.MsgTrailingStopUpdate, ts)
	}

	trailingEngine.OnFired = func(ts *orders.TrailingStop) {
		wsHub.BroadcastMessage(hub.MsgTrailingStopFired, ts)
	}

	crossingEngine.OnTriggered = func(alert *orders.CrossingAlert, order *alpacaAPI.Order) {
		wsHub.BroadcastMessage(hub.MsgCrossingTriggered, map[string]interface{}{
			"alert":   alert,
			"orderId": order.ID,
		})
	}

	// Wire stock stream -> hub (bars + quotes as fallback for symbols Finnhub doesn't cover)
	stockStream.OnBar = func(b stream.Bar) {
		wsHub.BroadcastMessage(hub.MsgBar, b)
	}
	stockStream.OnQuote = func(q stream.Quote) {
		wsHub.BroadcastMessage(hub.MsgStockQuote, q)
		mid := decimal.NewFromFloat((q.BidPrice + q.AskPrice) / 2)
		crossingEngine.CheckPrice(q.Symbol, mid)
	}

	// Finnhub trade stream -> hub + crossing engine (replaces Alpaca IEX quotes)
	finnhubStream.OnTrade = func(symbol string, price float64, volume int64, timestamp int64) {
		wsHub.BroadcastMessage(hub.MsgStockQuote, map[string]interface{}{
			"Symbol":   symbol,
			"BidPrice": price,
			"AskPrice": price,
			"Timestamp": time.Unix(0, timestamp*int64(time.Millisecond)).UTC(),
		})
		mid := decimal.NewFromFloat(price)
		crossingEngine.CheckPrice(symbol, mid)
	}

	// Tiingo IEX stream -> hub + crossing engine (additional quote source)
	tiingoStream.OnTrade = func(symbol string, price float64, volume int64, timestamp time.Time) {
		wsHub.BroadcastMessage(hub.MsgStockQuote, map[string]interface{}{
			"Symbol":    symbol,
			"BidPrice":  price,
			"AskPrice":  price,
			"Timestamp": timestamp,
		})
		mid := decimal.NewFromFloat(price)
		crossingEngine.CheckPrice(symbol, mid)
	}
	tiingoStream.OnQuote = func(symbol string, bidPrice, askPrice float64, timestamp time.Time) {
		wsHub.BroadcastMessage(hub.MsgStockQuote, map[string]interface{}{
			"Symbol":    symbol,
			"BidPrice":  bidPrice,
			"AskPrice":  askPrice,
			"Timestamp": timestamp,
		})
		mid := decimal.NewFromFloat((bidPrice + askPrice) / 2)
		crossingEngine.CheckPrice(symbol, mid)
	}

	// Wire option stream -> hub + trailing stop engine
	optionStream.OnQuote = func(q stream.OptionQuote) {
		wsHub.BroadcastMessage(hub.MsgOptionQuote, q)
		mid := decimal.NewFromFloat((q.BidPrice + q.AskPrice) / 2)
		trailingEngine.UpdatePrice(q.Symbol, mid)
	}

	// Wire trading stream -> hub + order manager fill detection + broadcast positions/account
	tradingStream.OnUpdate = func(tu alpacaAPI.TradeUpdate) {
		wsHub.BroadcastMessage(hub.MsgTradeUpdate, tu)
		if tu.Event == "fill" && tu.Price != nil {
			orderMgr.HandleFill(tu.Order.ID, *tu.Price)
			// When a sell-to-close fills, clean up any stops for that symbol
			if string(tu.Order.PositionIntent) == "sell_to_close" {
				removed := trailingEngine.RemoveBySymbol(tu.Order.Symbol)
				for _, ts := range removed {
					wsHub.BroadcastMessage(hub.MsgTrailingStopFired, ts)
				}
			}
		}
		if tu.Event == "fill" || tu.Event == "canceled" || tu.Event == "partial_fill" {
			go func() {
				positions, err := client.Trading.GetPositions()
				if err == nil {
					wsHub.BroadcastMessage(hub.MsgPositionsUpdate, positions)
				}
				account, err := client.Trading.GetAccount()
				if err == nil {
					wsHub.BroadcastMessage(hub.MsgAccountUpdate, account)
				}
			}()
		}
	}

	// Connect streams (Alpaca streams in background — they block on auth retries
	// during deploys when the old instance still holds connections)
	go func() {
		if err := stockStream.Connect(ctx); err != nil {
			log.Printf("Warning: stock stream connect failed: %v", err)
		}
	}()
	go func() {
		if err := optionStream.Connect(ctx); err != nil {
			log.Printf("Warning: option stream connect failed: %v", err)
		}
	}()
	tradingStream.Start(ctx)
	if cfg.FinnhubAPIKey != "" {
		if err := finnhubStream.Connect(ctx); err != nil {
			log.Printf("Warning: Finnhub stream connect failed: %v", err)
		}
	} else {
		log.Println("Warning: FINNHUB_API_KEY not set, Finnhub stream disabled")
	}
	if cfg.TiingoAPIKey != "" {
		if err := tiingoStream.Connect(ctx); err != nil {
			log.Printf("Warning: Tiingo stream connect failed: %v", err)
		}
	} else {
		log.Println("Warning: TIINGO_API_KEY not set, Tiingo stream disabled")
	}

	// HTTP server
	server := &api.Server{
		Alpaca:         client,
		Hub:            wsHub,
		StockStream:    stockStream,
		OptionStream:   optionStream,
		FinnhubStream:  finnhubStream,
		TiingoStream:   tiingoStream,
		OrderManager:   orderMgr,
		CrossingEngine: crossingEngine,
		TrailingEngine: trailingEngine,
		AllowedOrigins: cfg.AllowedOrigins,
	}

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := http.ListenAndServe(addr, server.Router()); err != nil {
		log.Fatal(err)
	}
}
