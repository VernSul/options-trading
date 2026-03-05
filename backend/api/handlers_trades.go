package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
	"github.com/shopspring/decimal"
)

type Trade struct {
	Symbol         string           `json:"symbol"`
	Side           string           `json:"side"`           // buy_to_open / sell_to_open
	Qty            decimal.Decimal  `json:"qty"`
	EntryPrice     decimal.Decimal  `json:"entryPrice"`
	ExitPrice      *decimal.Decimal `json:"exitPrice"`
	PnL            *decimal.Decimal `json:"pnl"`
	PnLPercent     *decimal.Decimal `json:"pnlPercent"`
	EntryTime      time.Time        `json:"entryTime"`
	ExitTime       *time.Time       `json:"exitTime"`
	Status         string           `json:"status"`     // open, closed
	ExitReason     string           `json:"exitReason"` // trailing, stop_loss, manual, or empty
	EntryOrderID   string           `json:"entryOrderId"`
	ExitOrderID    string           `json:"exitOrderId,omitempty"`
	PositionIntent string           `json:"positionIntent"`
}

func (s *Server) HandleGetTrades(w http.ResponseWriter, r *http.Request) {
	// Fetch closed (filled) orders — last 200 to cover recent history
	closedOrders, err := s.Alpaca.Trading.GetOrders(alpaca.GetOrdersRequest{
		Status:    "closed",
		Limit:     200,
		Direction: "desc",
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Only keep filled orders
	var filled []alpaca.Order
	for _, o := range closedOrders {
		if o.Status == "filled" && o.FilledAvgPrice != nil {
			filled = append(filled, o)
		}
	}

	// Sort by filled time ascending for pairing
	sort.Slice(filled, func(i, j int) bool {
		if filled[i].FilledAt == nil || filled[j].FilledAt == nil {
			return false
		}
		return filled[i].FilledAt.Before(*filled[j].FilledAt)
	})

	// Group into round-trip trades by symbol
	// Track open entries per symbol; when a closing order arrives, pair it
	type openEntry struct {
		order alpaca.Order
		qty   decimal.Decimal
	}
	openEntries := make(map[string][]openEntry) // symbol -> FIFO queue
	var trades []Trade

	for _, o := range filled {
		intent := string(o.PositionIntent)
		isOpen := intent == "buy_to_open" || intent == "sell_to_open"
		isClose := intent == "buy_to_close" || intent == "sell_to_close"

		if isOpen {
			openEntries[o.Symbol] = append(openEntries[o.Symbol], openEntry{order: o, qty: o.FilledQty})
		} else if isClose {
			// Pair with oldest open entry for this symbol
			entries := openEntries[o.Symbol]
			closeQty := o.FilledQty
			closePrice := *o.FilledAvgPrice

			for len(entries) > 0 && closeQty.GreaterThan(decimal.Zero) {
				entry := &entries[0]
				matchQty := decimal.Min(entry.qty, closeQty)

				entryPrice := *entry.order.FilledAvgPrice
				// PnL depends on direction: long (buy_to_open) profits when exit > entry
				var pnl decimal.Decimal
				if string(entry.order.PositionIntent) == "buy_to_open" {
					pnl = closePrice.Sub(entryPrice).Mul(matchQty).Mul(decimal.NewFromInt(100))
				} else {
					pnl = entryPrice.Sub(closePrice).Mul(matchQty).Mul(decimal.NewFromInt(100))
				}
				pnlPct := decimal.Zero
				if !entryPrice.IsZero() {
					pnlPct = closePrice.Sub(entryPrice).Div(entryPrice).Mul(decimal.NewFromInt(100))
					if string(entry.order.PositionIntent) == "sell_to_open" {
						pnlPct = pnlPct.Neg()
					}
				}

				exitReason := "manual"
				if s.TrailingEngine != nil {
					if reason := s.TrailingEngine.GetExitReason(o.ID); reason != "" {
						exitReason = reason
					}
				}

				trade := Trade{
					Symbol:         o.Symbol,
					Side:           string(entry.order.PositionIntent),
					Qty:            matchQty,
					EntryPrice:     entryPrice,
					ExitPrice:      &closePrice,
					PnL:            &pnl,
					PnLPercent:     &pnlPct,
					EntryTime:      *entry.order.FilledAt,
					ExitTime:       o.FilledAt,
					Status:         "closed",
					ExitReason:     exitReason,
					EntryOrderID:   entry.order.ID,
					ExitOrderID:    o.ID,
					PositionIntent: string(entry.order.PositionIntent),
				}
				trades = append(trades, trade)

				entry.qty = entry.qty.Sub(matchQty)
				closeQty = closeQty.Sub(matchQty)

				if entry.qty.IsZero() {
					entries = entries[1:]
				}
			}
			openEntries[o.Symbol] = entries
		}
	}

	// Add remaining open entries as open trades (no exit yet)
	for _, entries := range openEntries {
		for _, e := range entries {
			if e.qty.GreaterThan(decimal.Zero) {
				trade := Trade{
					Symbol:         e.order.Symbol,
					Side:           string(e.order.PositionIntent),
					Qty:            e.qty,
					EntryPrice:     *e.order.FilledAvgPrice,
					EntryTime:      *e.order.FilledAt,
					Status:         "open",
					EntryOrderID:   e.order.ID,
					PositionIntent: string(e.order.PositionIntent),
				}
				trades = append(trades, trade)
			}
		}
	}

	// Sort by entry time descending (most recent first)
	sort.Slice(trades, func(i, j int) bool {
		return trades[i].EntryTime.After(trades[j].EntryTime)
	})

	json.NewEncoder(w).Encode(trades)
}
