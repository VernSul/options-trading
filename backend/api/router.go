package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	alpacaClient "options-trading/alpaca"
	"options-trading/finnhub"
	"options-trading/hub"
	"options-trading/orders"
	"options-trading/tiingo"

	"github.com/go-chi/chi/v5"
	chiCors "github.com/go-chi/cors"
	"github.com/gorilla/websocket"
	"github.com/shopspring/decimal"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
	"github.com/alpacahq/alpaca-trade-api-go/v3/marketdata"
)

type Server struct {
	Alpaca         *alpacaClient.Client
	Hub            *hub.Hub
	StockStream    *alpacaClient.StockStream
	OptionStream   *alpacaClient.OptionStream
	FinnhubStream  *finnhub.Stream
	TiingoStream   *tiingo.Stream
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
		r.Get("/trades", s.HandleGetTrades)
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
			log.Printf("WS subscribe: channel=%s symbols=%v", msg.Channel, msg.Symbols)
			for _, sym := range msg.Symbols {
				switch msg.Channel {
				case "bars":
					if err := s.StockStream.SubscribeToBars(sym); err != nil {
						log.Printf("WS subscribe bars %s error: %v", sym, err)
					}
				case "quotes":
					// Subscribe to both Alpaca IEX and Finnhub for coverage
					if err := s.StockStream.SubscribeToQuotes(sym); err != nil {
						log.Printf("WS subscribe quotes %s error: %v", sym, err)
					}
					if s.FinnhubStream != nil {
						s.FinnhubStream.Subscribe(sym)
					}
					if s.TiingoStream != nil {
						s.TiingoStream.Subscribe(sym)
					}
				case "option_quotes":
					if err := s.OptionStream.SubscribeToQuotes(sym); err != nil {
						log.Printf("WS subscribe option_quotes %s error: %v", sym, err)
					}
				}
			}
		case "unsubscribe":
			log.Printf("WS unsubscribe: channel=%s symbols=%v", msg.Channel, msg.Symbols)
			for _, sym := range msg.Symbols {
				switch msg.Channel {
				case "bars":
					s.StockStream.UnsubscribeFromBars(sym)
				case "quotes":
					s.StockStream.UnsubscribeFromQuotes(sym)
					if s.FinnhubStream != nil {
						s.FinnhubStream.Unsubscribe(sym)
					}
					if s.TiingoStream != nil {
						s.TiingoStream.Unsubscribe(sym)
					}
				case "option_quotes":
					s.OptionStream.UnsubscribeFromQuotes(sym)
				}
			}

		case hub.MsgPlaceOrder:
			s.handleWSPlaceOrder(msg.Payload)

		case hub.MsgCancelOrder:
			s.handleWSCancelOrder(msg.Payload)

		case hub.MsgCancelAllOrders:
			s.handleWSCancelAllOrders()

		case hub.MsgClosePosition:
			s.handleWSClosePosition(msg.Payload)

		case hub.MsgCloseAllPositions:
			s.handleWSCloseAllPositions()
		}
	})

	s.Hub.Register(client)
	go client.WritePump()
	go client.ReadPump()
}

func (s *Server) handleWSPlaceOrder(payload json.RawMessage) {
	var req orders.SmartOrder
	if err := json.Unmarshal(payload, &req); err != nil {
		log.Printf("WS place_order decode error: %v", err)
		s.Hub.BroadcastMessage(hub.MsgOrderError, map[string]string{
			"error": "Invalid order payload: " + err.Error(),
		})
		return
	}

	order, err := s.OrderManager.PlaceSmartOrder(req)
	if err != nil {
		log.Printf("WS place_order failed: %v", err)
		s.Hub.BroadcastMessage(hub.MsgOrderError, map[string]string{
			"error":  err.Error(),
			"symbol": req.Symbol,
		})
		return
	}

	s.Hub.BroadcastMessage(hub.MsgOrderPlaced, order)
	s.broadcastPositionsAndAccount()
}

func (s *Server) handleWSCancelOrder(payload json.RawMessage) {
	var req struct {
		OrderID string `json:"orderId"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		log.Printf("WS cancel_order decode error: %v", err)
		return
	}

	if err := s.Alpaca.Trading.CancelOrder(req.OrderID); err != nil {
		log.Printf("WS cancel_order failed: %v", err)
		s.Hub.BroadcastMessage(hub.MsgOrderError, map[string]string{
			"error": "Cancel failed: " + err.Error(),
		})
		return
	}

	s.broadcastPositionsAndAccount()
}

func (s *Server) handleWSCancelAllOrders() {
	if err := s.Alpaca.Trading.CancelAllOrders(); err != nil {
		log.Printf("WS cancel_all_orders failed: %v", err)
		s.Hub.BroadcastMessage(hub.MsgOrderError, map[string]string{
			"error": "Cancel all failed: " + err.Error(),
		})
		return
	}

	s.broadcastPositionsAndAccount()
}

func (s *Server) handleWSClosePosition(payload json.RawMessage) {
	var req struct {
		Symbol string  `json:"symbol"`
		Qty    *string `json:"qty,omitempty"`
	}
	if err := json.Unmarshal(payload, &req); err != nil {
		log.Printf("WS close_position decode error: %v", err)
		return
	}

	closeReq := alpaca.ClosePositionRequest{}
	if req.Qty != nil {
		q, _ := decimal.NewFromString(*req.Qty)
		closeReq.Qty = q
	}

	order, err := s.Alpaca.Trading.ClosePosition(req.Symbol, closeReq)
	if err != nil {
		log.Printf("WS close_position failed: %v", err)
		s.Hub.BroadcastMessage(hub.MsgOrderError, map[string]string{
			"error":  "Close failed: " + err.Error(),
			"symbol": req.Symbol,
		})
		return
	}

	s.Hub.BroadcastMessage(hub.MsgOrderPlaced, order)
	s.broadcastPositionsAndAccount()
}

func (s *Server) handleWSCloseAllPositions() {
	positions, err := s.Alpaca.Trading.GetPositions()
	if err != nil {
		log.Printf("WS close_all_positions get failed: %v", err)
		s.Hub.BroadcastMessage(hub.MsgOrderError, map[string]string{
			"error": "Get positions failed: " + err.Error(),
		})
		return
	}

	for _, pos := range positions {
		_, err := s.Alpaca.Trading.ClosePosition(pos.Symbol, alpaca.ClosePositionRequest{})
		if err != nil {
			log.Printf("WS close position %s failed: %v", pos.Symbol, err)
		}
	}

	s.broadcastPositionsAndAccount()
}

func (s *Server) broadcastPositionsAndAccount() {
	go func() {
		positions, err := s.Alpaca.Trading.GetPositions()
		if err != nil {
			log.Printf("Broadcast positions fetch error: %v", err)
		} else {
			s.Hub.BroadcastMessage(hub.MsgPositionsUpdate, positions)
		}

		account, err := s.Alpaca.Trading.GetAccount()
		if err != nil {
			log.Printf("Broadcast account fetch error: %v", err)
		} else {
			s.Hub.BroadcastMessage(hub.MsgAccountUpdate, account)
		}
	}()
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

	// Dynamic lookback by timeframe
	end := time.Now()
	var start time.Time
	switch tf {
	case "5Min":
		start = end.Add(-3 * 24 * time.Hour)
	case "15Min":
		start = end.Add(-5 * 24 * time.Hour)
	case "1H":
		start = end.Add(-10 * 24 * time.Hour)
	case "1D":
		start = end.AddDate(0, -6, 0)
	default: // 1Min
		start = end.Add(-24 * time.Hour)
	}

	// Feed selection: SIP for extended hours, IEX otherwise
	feed := marketdata.IEX
	if r.URL.Query().Get("extendedHours") == "true" {
		feed = marketdata.SIP
	}

	bars, err := s.Alpaca.GetBars(symbol, timeframe, start, end, 0, feed)
	if err != nil {
		// Fallback to IEX if SIP fails (user may not have SIP subscription)
		if feed == marketdata.SIP {
			bars, err = s.Alpaca.GetBars(symbol, timeframe, start, end, 0, marketdata.IEX)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
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
