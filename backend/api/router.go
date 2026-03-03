package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	alpacaClient "options-trading/alpaca"
	"options-trading/hub"
	"options-trading/orders"

	"github.com/go-chi/chi/v5"
	chiCors "github.com/go-chi/cors"
	"github.com/gorilla/websocket"

	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
)

type Server struct {
	Alpaca         *alpacaClient.Client
	Hub            *hub.Hub
	StockStream    *alpacaClient.StockStream
	OptionStream   *alpacaClient.OptionStream
	OrderManager   *orders.OrderManager
	CrossingEngine *orders.CrossingEngine
	AllowedOrigins string
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(chiCors.Handler(chiCors.Options{
		AllowedOrigins:   strings.Split(s.AllowedOrigins, ","),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(RecoveryMiddleware)
	r.Use(LoggingMiddleware)
	r.Use(jsonContentType)

	r.Route("/api", func(r chi.Router) {
		r.Get("/account", s.HandleGetAccount)
		r.Get("/positions", s.HandleGetPositions)
		r.Delete("/positions/{symbol}", s.HandleClosePosition)
		r.Get("/orders", s.HandleGetOrders)
		r.Post("/orders", s.HandlePlaceOrder)
		r.Delete("/orders/{orderID}", s.HandleCancelOrder)
		r.Delete("/orders", s.HandleCancelAllOrders)
		r.Get("/options/chain/{symbol}", s.HandleGetOptionChain)
		r.Post("/subscribe", s.HandleSubscribe)
		r.Post("/unsubscribe", s.HandleUnsubscribe)
		r.Post("/crossing", s.HandleCreateCrossing)
		r.Get("/crossing", s.HandleGetCrossings)
		r.Delete("/crossing/{id}", s.HandleDeleteCrossing)
		r.Get("/bars/{symbol}", s.HandleGetBars)
		r.Get("/quote/{symbol}", s.HandleGetQuote)
	})

	r.Get("/ws", s.HandleWebSocket)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	return r
}

func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	client := hub.NewClient(s.Hub, conn, func(msg hub.ClientMessage) {
		switch msg.Type {
		case "subscribe":
			for _, sym := range msg.Symbols {
				switch msg.Channel {
				case "bars":
					s.StockStream.SubscribeToBars(sym)
				case "quotes":
					s.StockStream.SubscribeToQuotes(sym)
				case "option_quotes":
					s.OptionStream.SubscribeToQuotes(sym)
				}
			}
		case "unsubscribe":
			for _, sym := range msg.Symbols {
				switch msg.Channel {
				case "bars":
					s.StockStream.UnsubscribeFromBars(sym)
				case "quotes":
					s.StockStream.UnsubscribeFromQuotes(sym)
				case "option_quotes":
					s.OptionStream.UnsubscribeFromQuotes(sym)
				}
			}
		}
	})

	s.Hub.Register(client)
	go client.WritePump()
	go client.ReadPump()
}

func (s *Server) HandleGetBars(w http.ResponseWriter, r *http.Request) {
	symbol := chi.URLParam(r, "symbol")

	tf := r.URL.Query().Get("timeframe")
	timeframe := marketdata.OneMin
	switch tf {
	case "5Min":
		timeframe = marketdata.NewTimeFrame(5, marketdata.Min)
	case "15Min":
		timeframe = marketdata.NewTimeFrame(15, marketdata.Min)
	case "1H":
		timeframe = marketdata.OneHour
	case "1D":
		timeframe = marketdata.OneDay
	}

	end := time.Now()
	start := end.Add(-24 * time.Hour)
	if tf == "1D" {
		start = end.AddDate(0, -6, 0)
	}

	bars, err := s.Alpaca.GetBars(symbol, timeframe, start, end, 0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(bars)
}

func jsonContentType(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ws" {
			w.Header().Set("Content-Type", "application/json")
		}
		next.ServeHTTP(w, r)
	})
}
