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

func (s *Server) HandleGetStops(w http.ResponseWriter, r *http.Request) {
	stops := s.TrailingEngine.GetAll()
	if stops == nil {
		stops = []*orders.TrailingStop{}
	}
	json.NewEncoder(w).Encode(stops)
}

// closePosition closes a position. For option symbols (OCC format, len >= 15),
// it places a market sell-to-close order instead of using ClosePosition,
// which Alpaca rejects for accounts not approved for uncovered options.
func closePosition(trading *alpaca.Client, symbol string, qty *decimal.Decimal) (*alpaca.Order, error) {
	if len(symbol) >= 15 {
		// Option symbol — use PlaceOrder with sell-to-close
		req := alpaca.PlaceOrderRequest{
			Symbol:         symbol,
			Side:           alpaca.Sell,
			Type:           alpaca.Market,
			TimeInForce:    alpaca.Day,
			PositionIntent: alpaca.SellToClose,
		}
		if qty != nil && !qty.IsZero() {
			req.Qty = qty
		} else {
			// Need qty — look up position
			pos, err := trading.GetPosition(symbol)
			if err != nil {
				return nil, err
			}
			q := pos.Qty
			req.Qty = &q
		}
		return trading.PlaceOrder(req)
	}
	// Stock — ClosePosition works fine
	closeReq := alpaca.ClosePositionRequest{}
	if qty != nil {
		closeReq.Qty = *qty
	}
	return trading.ClosePosition(symbol, closeReq)
}
