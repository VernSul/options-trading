package api

import (
	"encoding/json"
	"net/http"

	"options-trading/orders"

	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
)

func (s *Server) HandleGetOrders(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "open"
	}
	orderList, err := s.Alpaca.Trading.GetOrders(alpaca.GetOrdersRequest{
		Status: status,
		Limit:  100,
		Nested: true,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(orderList)
}

func (s *Server) HandlePlaceOrder(w http.ResponseWriter, r *http.Request) {
	var req orders.SmartOrder
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	order, err := s.OrderManager.PlaceSmartOrder(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(order)
}

func (s *Server) HandleCancelOrder(w http.ResponseWriter, r *http.Request) {
	orderID := chi.URLParam(r, "orderID")
	if err := s.Alpaca.Trading.CancelOrder(orderID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleCancelAllOrders(w http.ResponseWriter, r *http.Request) {
	if err := s.Alpaca.Trading.CancelAllOrders(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func alpacaClosePositionRequest(qty *string) alpaca.ClosePositionRequest {
	if qty != nil {
		q, _ := decimal.NewFromString(*qty)
		return alpaca.ClosePositionRequest{Qty: q}
	}
	return alpaca.ClosePositionRequest{}
}
