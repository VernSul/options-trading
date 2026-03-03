package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"cloud.google.com/go/civil"
	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
)

func (s *Server) HandleGetQuote(w http.ResponseWriter, r *http.Request) {
	symbol := chi.URLParam(r, "symbol")

	quote, err := s.Alpaca.GetLatestQuote(symbol)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(quote)
}

func (s *Server) HandleGetOptionChain(w http.ResponseWriter, r *http.Request) {
	symbol := chi.URLParam(r, "symbol")

	req := marketdata.GetOptionChainRequest{}

	if exp := r.URL.Query().Get("expiration"); exp != "" {
		t, err := time.Parse("2006-01-02", exp)
		if err == nil {
			req.ExpirationDate = civil.DateOf(t)
		}
	}
	if expGte := r.URL.Query().Get("expiration_gte"); expGte != "" {
		t, err := time.Parse("2006-01-02", expGte)
		if err == nil {
			req.ExpirationDateGte = civil.DateOf(t)
		}
	}
	if expLte := r.URL.Query().Get("expiration_lte"); expLte != "" {
		t, err := time.Parse("2006-01-02", expLte)
		if err == nil {
			req.ExpirationDateLte = civil.DateOf(t)
		}
	}
	if optType := r.URL.Query().Get("type"); optType != "" {
		req.Type = marketdata.OptionType(optType)
	}
	if strikeGte := r.URL.Query().Get("strike_gte"); strikeGte != "" {
		if v, err := strconv.ParseFloat(strikeGte, 64); err == nil {
			req.StrikePriceGte = v
		}
	}
	if strikeLte := r.URL.Query().Get("strike_lte"); strikeLte != "" {
		if v, err := strconv.ParseFloat(strikeLte, 64); err == nil {
			req.StrikePriceLte = v
		}
	}

	chain, err := s.Alpaca.GetOptionChain(symbol, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(chain)
}
