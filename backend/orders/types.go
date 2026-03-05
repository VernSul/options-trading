package orders

import "github.com/shopspring/decimal"

type SmartOrder struct {
	Symbol         string            `json:"symbol"`
	Qty            int               `json:"qty"`
	Side           string            `json:"side"`           // buy, sell
	Type           string            `json:"type"`           // market, limit
	PositionIntent string            `json:"positionIntent"` // buy_to_open, buy_to_close, sell_to_open, sell_to_close
	LimitPrice     *decimal.Decimal  `json:"limitPrice,omitempty"`
	TimeInForce    string            `json:"timeInForce"` // day
	StopLoss       *StopLossConfig   `json:"stopLoss,omitempty"`
	TrailingStop   *TrailingConfig   `json:"trailingStop,omitempty"`
	TakeProfit     *TakeProfitConfig `json:"takeProfit,omitempty"`
}

type TakeProfitConfig struct {
	LimitPrice decimal.Decimal `json:"limitPrice"` // sell-to-close limit price
}

type StopLossConfig struct {
	StopPrice  decimal.Decimal  `json:"stopPrice"`
	LimitPrice *decimal.Decimal `json:"limitPrice,omitempty"` // if set, stop-limit; else stop-market
}

type TrailingConfig struct {
	TrailAmount   decimal.Decimal `json:"trailAmount"`   // dollar amount below high water (used for safety-net)
	SafetyStop    decimal.Decimal `json:"safetyStop"`    // initial stop price (placed on fill)
	StartPercent  decimal.Decimal `json:"startPercent"`  // % gain from entry to activate trailing (e.g. 0.02 = 2%)
	OffsetPercent decimal.Decimal `json:"offsetPercent"` // % drop from high-water to set stop (e.g. 0.01 = 1%)
}

type CrossingAlert struct {
	ID             string           `json:"id"`
	Underlying     string           `json:"underlying"`     // e.g. AAPL
	ThresholdPrice decimal.Decimal  `json:"thresholdPrice"` // trigger price
	Direction      string           `json:"direction"`      // above, below
	OptionSymbol   string           `json:"optionSymbol"`   // OCC symbol to trade
	Qty            int              `json:"qty"`
	Side           string           `json:"side"`
	PositionIntent string           `json:"positionIntent"`
	OrderType      string           `json:"orderType"` // market, limit
	LimitPrice     *decimal.Decimal `json:"limitPrice,omitempty"`
	Triggered      bool             `json:"triggered"`
}

type TrailingStop struct {
	OrderID       string          `json:"orderId"`       // entry order ID
	Symbol        string          `json:"symbol"`        // option symbol
	Qty           int             `json:"qty"`
	TrailAmount   decimal.Decimal `json:"trailAmount"`
	HighWater     decimal.Decimal `json:"highWater"`
	StopPrice     decimal.Decimal `json:"stopPrice"`     // current computed stop = HW*(1-offsetPct)
	SafetyStop    decimal.Decimal `json:"safetyStop"`    // initial stop price protecting against loss before trailing activates
	Active        bool            `json:"active"`
	Fired         bool            `json:"fired"`         // true once close is triggered
	ExitReason    string          `json:"exitReason"`    // trailing, stop_loss, safety (set when fired)
	EntryPrice    decimal.Decimal `json:"entryPrice"`    // filled price of entry order
	StartPercent  decimal.Decimal `json:"startPercent"`  // % gain to activate (e.g. 0.02)
	OffsetPercent decimal.Decimal `json:"offsetPercent"` // % drop from high-water for stop (e.g. 0.01)
}

