package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"
)

func (s *Server) HandleGetPositions(w http.ResponseWriter, r *http.Request) {
	positions, err := s.Alpaca.Trading.GetPositions()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(positions)
}

func (s *Server) HandleClosePosition(w http.ResponseWriter, r *http.Request) {
	symbol := chi.URLParam(r, "symbol")

	var req struct {
		Qty *string `json:"qty,omitempty"`
	}
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&req)
	}

	var qty *decimal.Decimal
	if req.Qty != nil {
		q, _ := decimal.NewFromString(*req.Qty)
		qty = &q
	}
	order, err := closePosition(s.Alpaca.Trading, symbol, qty)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(order)
}
