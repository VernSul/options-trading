package api

import (
	"encoding/json"
	"net/http"
)

type SubscribeRequest struct {
	Symbols []string `json:"symbols"`
	Channel string   `json:"channel"` // bars, quotes, option_quotes
}

func (s *Server) HandleSubscribe(w http.ResponseWriter, r *http.Request) {
	var req SubscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	switch req.Channel {
	case "bars":
		if err := s.StockStream.SubscribeToBars(req.Symbols...); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case "quotes":
		if err := s.StockStream.SubscribeToQuotes(req.Symbols...); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case "option_quotes":
		if err := s.OptionStream.SubscribeToQuotes(req.Symbols...); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	default:
		http.Error(w, "unknown channel", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "subscribed"})
}

func (s *Server) HandleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var req SubscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	switch req.Channel {
	case "bars":
		if err := s.StockStream.UnsubscribeFromBars(req.Symbols...); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case "quotes":
		if err := s.StockStream.UnsubscribeFromQuotes(req.Symbols...); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	case "option_quotes":
		if err := s.OptionStream.UnsubscribeFromQuotes(req.Symbols...); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	default:
		http.Error(w, "unknown channel", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "unsubscribed"})
}
