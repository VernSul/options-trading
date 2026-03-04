package hub

import "encoding/json"

type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type ClientMessage struct {
	Type    string          `json:"type"`              // subscribe, unsubscribe, place_order, cancel_order, etc.
	Symbols []string        `json:"symbols,omitempty"` // stock or option symbols
	Channel string          `json:"channel,omitempty"` // bars, quotes, option_quotes
	Payload json.RawMessage `json:"payload,omitempty"` // order data etc.
}

// Server -> Client message types
const (
	MsgBar                = "bar"
	MsgStockQuote         = "stock_quote"
	MsgOptionQuote        = "option_quote"
	MsgTradeUpdate        = "trade_update"
	MsgPositionUpdate     = "position_update"
	MsgCrossingTriggered  = "crossing_triggered"
	MsgStopLossPlaced     = "stop_loss_placed"
	MsgTrailingStopUpdate = "trailing_stop_update"
	MsgTrailingStopFired  = "trailing_stop_fired"
	MsgHeartbeat          = "heartbeat"
	MsgError              = "error"
	MsgOrderPlaced        = "order_placed"
	MsgOrderError         = "order_error"
	MsgPositionsUpdate    = "positions_update"
	MsgAccountUpdate      = "account_update"
)

// Client -> Server message types
const (
	MsgPlaceOrder        = "place_order"
	MsgCancelOrder       = "cancel_order"
	MsgCancelAllOrders   = "cancel_all_orders"
	MsgClosePosition     = "close_position"
	MsgCloseAllPositions = "close_all_positions"
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
