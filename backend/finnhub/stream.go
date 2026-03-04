package finnhub

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const wsURL = "wss://ws.finnhub.io"

type tradeData struct {
	Symbol    string  `json:"s"`
	Price     float64 `json:"p"`
	Timestamp int64   `json:"t"`
	Volume    int64   `json:"v"`
}

type wsMessage struct {
	Type string      `json:"type"`
	Data []tradeData `json:"data,omitempty"`
}

type Stream struct {
	apiKey  string
	conn    *websocket.Conn
	mu      sync.Mutex
	subs    map[string]bool
	cancel  context.CancelFunc
	OnTrade func(symbol string, price float64, volume int64, timestamp int64)
}

func NewStream(apiKey string) *Stream {
	return &Stream{
		apiKey: apiKey,
		subs:   make(map[string]bool),
	}
}

func (s *Stream) Connect(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	return s.connectAndListen(ctx)
}

func (s *Stream) connectAndListen(ctx context.Context) error {
	if err := s.dial(); err != nil {
		return err
	}

	go s.readLoop(ctx)
	return nil
}

func (s *Stream) dial() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	url := wsURL + "?token=" + s.apiKey
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return err
	}
	s.conn = conn
	log.Println("Finnhub: connected")

	// Re-subscribe to all symbols
	for sym := range s.subs {
		s.sendSubscribe(sym)
	}

	return nil
}

func (s *Stream) readLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		_, data, err := s.conn.ReadMessage()
		if err != nil {
			log.Printf("Finnhub: read error: %v", err)
			s.reconnect(ctx)
			return
		}

		var msg wsMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.Type == "trade" && s.OnTrade != nil {
			for _, t := range msg.Data {
				s.OnTrade(t.Symbol, t.Price, t.Volume, t.Timestamp)
			}
		}
	}
}

func (s *Stream) reconnect(ctx context.Context) {
	for attempt := 1; ; attempt++ {
		select {
		case <-ctx.Done():
			return
		default:
		}

		delay := time.Duration(attempt) * 2 * time.Second
		if delay > 30*time.Second {
			delay = 30 * time.Second
		}
		log.Printf("Finnhub: reconnecting in %v (attempt %d)", delay, attempt)
		time.Sleep(delay)

		if err := s.dial(); err != nil {
			log.Printf("Finnhub: reconnect failed: %v", err)
			continue
		}

		go s.readLoop(ctx)
		return
	}
}

func (s *Stream) Subscribe(symbol string) {
	s.mu.Lock()
	s.subs[symbol] = true
	s.mu.Unlock()

	s.sendSubscribe(symbol)
	log.Printf("Finnhub: subscribed to %s", symbol)
}

func (s *Stream) Unsubscribe(symbol string) {
	s.mu.Lock()
	delete(s.subs, symbol)
	s.mu.Unlock()

	s.sendUnsubscribe(symbol)
	log.Printf("Finnhub: unsubscribed from %s", symbol)
}

func (s *Stream) sendSubscribe(symbol string) {
	msg, _ := json.Marshal(map[string]string{
		"type":   "subscribe",
		"symbol": symbol,
	})
	s.conn.WriteMessage(websocket.TextMessage, msg)
}

func (s *Stream) sendUnsubscribe(symbol string) {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return
	}
	msg, _ := json.Marshal(map[string]string{
		"type":   "unsubscribe",
		"symbol": symbol,
	})
	conn.WriteMessage(websocket.TextMessage, msg)
}
