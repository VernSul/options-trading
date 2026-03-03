package api

import (
	"encoding/json"
	"net/http"
)

func (s *Server) HandleGetAccount(w http.ResponseWriter, r *http.Request) {
	account, err := s.Alpaca.Trading.GetAccount()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(account)
}
