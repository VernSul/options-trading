package alpaca

import (
	"options-trading/config"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
)

type Client struct {
	Trading    *alpaca.Client
	MarketData *marketdata.Client
}

func NewClient(cfg *config.Config) *Client {
	tradingClient := alpaca.NewClient(alpaca.ClientOpts{
		APIKey:    cfg.AlpacaAPIKey,
		APISecret: cfg.AlpacaAPISecret,
		BaseURL:   cfg.AlpacaBaseURL,
	})

	mdClient := marketdata.NewClient(marketdata.ClientOpts{
		APIKey:    cfg.AlpacaAPIKey,
		APISecret: cfg.AlpacaAPISecret,
	})

	return &Client{
		Trading:    tradingClient,
		MarketData: mdClient,
	}
}
