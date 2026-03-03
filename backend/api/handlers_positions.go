package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
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

	// ClosePositionRequest needs percentage or qty
	order, err := s.Alpaca.Trading.ClosePosition(symbol, alpacaClosePositionRequest(req.Qty))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(order)
}
