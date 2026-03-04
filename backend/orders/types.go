package orders

import "github.com/shopspring/decimal"

type SmartOrder struct {
	Symbol         string           `json:"symbol"`
	Qty            int              `json:"qty"`
	Side           string           `json:"side"`           // buy, sell
	Type           string           `json:"type"`           // market, limit
	PositionIntent string           `json:"positionIntent"` // buy_to_open, buy_to_close, sell_to_open, sell_to_close
	LimitPrice     *decimal.Decimal `json:"limitPrice,omitempty"`
	TimeInForce    string           `json:"timeInForce"` // day
	StopLoss       *StopLossConfig  `json:"stopLoss,omitempty"`
	TrailingStop   *TrailingConfig  `json:"trailingStop,omitempty"`
}

type StopLossConfig struct {
	StopPrice  decimal.Decimal `json:"stopPrice"`
	LimitPrice *decimal.Decimal `json:"limitPrice,omitempty"` // if set, stop-limit; else stop-market
}

type TrailingConfig struct {
	TrailAmount   decimal.Decimal `json:"trailAmount"`   // dollar amount below high water (used for safety-net)
	SafetyStop    decimal.Decimal `json:"safetyStop"`    // wide safety-net stop price
	StartPercent  decimal.Decimal `json:"startPercent"`  // % gain from entry to activate trailing (e.g. 0.02 = 2%)
	OffsetPercent decimal.Decimal `json:"offsetPercent"` // % drop from high-water to trigger close (e.g. 0.01 = 1%)
}

type CrossingAlert struct {
	ID             string          `json:"id"`
	Underlying     string          `json:"underlying"`     // e.g. AAPL
	ThresholdPrice decimal.Decimal `json:"thresholdPrice"` // trigger price
	Direction      string          `json:"direction"`      // above, below
	OptionSymbol   string          `json:"optionSymbol"`   // OCC symbol to trade
	Qty            int             `json:"qty"`
	Side           string          `json:"side"`
	PositionIntent string          `json:"positionIntent"`
	OrderType      string          `json:"orderType"` // market, limit
	LimitPrice     *decimal.Decimal `json:"limitPrice,omitempty"`
	Triggered      bool            `json:"triggered"`
}

type TrailingStop struct {
	OrderID       string          `json:"orderId"`       // entry order ID
	Symbol        string          `json:"symbol"`        // option symbol
	Qty           int             `json:"qty"`
	TrailAmount   decimal.Decimal `json:"trailAmount"`
	HighWater     decimal.Decimal `json:"highWater"`
	SafetyStop    decimal.Decimal `json:"safetyStop"`
	Active        bool            `json:"active"`
	EntryPrice    decimal.Decimal `json:"entryPrice"`    // filled price of entry order
	StartPercent  decimal.Decimal `json:"startPercent"`  // % gain to activate (e.g. 0.02)
	OffsetPercent decimal.Decimal `json:"offsetPercent"` // % drop from high-water to fire (e.g. 0.01)
	SafetyOrderID string          `json:"safetyOrderId"` // Alpaca order ID for safety-net stop
}

type PendingStopLoss struct {
	EntryOrderID string          `json:"entryOrderId"`
	Symbol       string          `json:"symbol"`
	Qty          int             `json:"qty"`
	StopPrice    decimal.Decimal `json:"stopPrice"`
	LimitPrice   *decimal.Decimal `json:"limitPrice,omitempty"`
}
