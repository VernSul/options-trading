package api

import (
	"encoding/json"
	"net/http"

	"options-trading/orders"

	"github.com/go-chi/chi/v5"
)

func (s *Server) HandleCreateCrossing(w http.ResponseWriter, r *http.Request) {
	var alert orders.CrossingAlert
	if err := json.NewDecoder(r.Body).Decode(&alert); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	created := s.CrossingEngine.AddAlert(alert)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (s *Server) HandleGetCrossings(w http.ResponseWriter, r *http.Request) {
	alerts := s.CrossingEngine.GetAlerts()
	json.NewEncoder(w).Encode(alerts)
}

func (s *Server) HandleDeleteCrossing(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s.CrossingEngine.RemoveAlert(id)
	w.WriteHeader(http.StatusNoContent)
}
