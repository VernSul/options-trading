package alpaca

import (
	"time"

	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
)

func (c *Client) GetBars(symbol string, timeframe marketdata.TimeFrame, start, end time.Time, limit int, feed marketdata.Feed) ([]marketdata.Bar, error) {
	return c.MarketData.GetBars(symbol, marketdata.GetBarsRequest{
		TimeFrame:  timeframe,
		Start:      start,
		End:        end,
		TotalLimit: limit,
		Feed:       feed,
	})
}

func (c *Client) GetOptionChain(underlying string, req marketdata.GetOptionChainRequest) (map[string]marketdata.OptionSnapshot, error) {
	req.Feed = marketdata.OptionFeed("indicative")
	return c.MarketData.GetOptionChain(underlying, req)
}

func (c *Client) GetOptionSnapshot(symbol string) (*marketdata.OptionSnapshot, error) {
	return c.MarketData.GetOptionSnapshot(symbol, marketdata.GetOptionSnapshotRequest{
		Feed: marketdata.OptionFeed("indicative"),
	})
}

func (c *Client) GetLatestQuote(symbol string, feed marketdata.Feed) (*marketdata.Quote, error) {
	return c.MarketData.GetLatestQuote(symbol, marketdata.GetLatestQuoteRequest{
		Feed: feed,
	})
}
