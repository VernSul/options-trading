package hub

import "encoding/json"

type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type ClientMessage struct {
	Type    string   `json:"type"`    // subscribe, unsubscribe
	Symbols []string `json:"symbols"` // stock or option symbols
	Channel string   `json:"channel"` // bars, quotes, option_quotes
}

// Server -> Client message types
const (
	MsgBar              = "bar"
	MsgStockQuote       = "stock_quote"
	MsgOptionQuote      = "option_quote"
	MsgTradeUpdate      = "trade_update"
	MsgPositionUpdate   = "position_update"
	MsgCrossingTriggered = "crossing_triggered"
	MsgStopLossPlaced   = "stop_loss_placed"
	MsgTrailingStopUpdate = "trailing_stop_update"
	MsgHeartbeat        = "heartbeat"
	MsgError            = "error"
)

func NewMessage(msgType string, payload interface{}) ([]byte, error) {
	p, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(WSMessage{
		Type:    msgType,
		Payload: p,
	})
}
