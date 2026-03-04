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

	if err := s.dial(); err != nil {
		// Initial connect failed — start background reconnect loop
		go s.reconnectLoop(ctx)
		return err
	}

	go s.runLoop(ctx)
	return nil
}

func (s *Stream) dial() error {
	s.mu.Lock()
	old := s.conn
	s.mu.Unlock()

	// Close old connection if any
	if old != nil {
		old.Close()
	}

	url := wsURL + "?token=" + s.apiKey
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.conn = conn
	// Re-subscribe to all symbols
	for sym := range s.subs {
		msg, _ := json.Marshal(map[string]string{
			"type":   "subscribe",
			"symbol": sym,
		})
		conn.WriteMessage(websocket.TextMessage, msg)
	}
	s.mu.Unlock()

	log.Println("Finnhub: connected")
	return nil
}

// runLoop reads messages until error, then enters reconnect loop. Only one goroutine runs this.
func (s *Stream) runLoop(ctx context.Context) {
	for {
		// Read phase
		err := s.readUntilError(ctx)
		if err == nil {
			// Context cancelled
			return
		}
		log.Printf("Finnhub: read error: %v", err)

		// Reconnect phase (blocking — no new goroutines)
		if !s.reconnectLoop(ctx) {
			return // context cancelled
		}
	}
}

// readUntilError reads messages until an error occurs or context is cancelled.
// Returns nil if context is cancelled, error otherwise.
func (s *Stream) readUntilError(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		s.mu.Lock()
		conn := s.conn
		s.mu.Unlock()

		if conn == nil {
			return nil
		}

		_, data, err := conn.ReadMessage()
		if err != nil {
			return err
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

// reconnectLoop tries to reconnect with backoff. Returns true if connected, false if context cancelled.
func (s *Stream) reconnectLoop(ctx context.Context) bool {
	for attempt := 1; ; attempt++ {
		select {
		case <-ctx.Done():
			return false
		default:
		}

		delay := time.Duration(attempt) * 2 * time.Second
		if delay > 30*time.Second {
			delay = 30 * time.Second
		}
		log.Printf("Finnhub: reconnecting in %v (attempt %d)", delay, attempt)

		select {
		case <-ctx.Done():
			return false
		case <-time.After(delay):
		}

		if err := s.dial(); err != nil {
			log.Printf("Finnhub: reconnect failed: %v", err)
			continue
		}

		return true
	}
}

func (s *Stream) Subscribe(symbol string) {
	s.mu.Lock()
	s.subs[symbol] = true
	conn := s.conn
	s.mu.Unlock()

	if conn != nil {
		msg, _ := json.Marshal(map[string]string{
			"type":   "subscribe",
			"symbol": symbol,
		})
		conn.WriteMessage(websocket.TextMessage, msg)
	}
	log.Printf("Finnhub: subscribed to %s", symbol)
}

func (s *Stream) Unsubscribe(symbol string) {
	s.mu.Lock()
	delete(s.subs, symbol)
	conn := s.conn
	s.mu.Unlock()

	if conn != nil {
		msg, _ := json.Marshal(map[string]string{
			"type":   "unsubscribe",
			"symbol": symbol,
		})
		conn.WriteMessage(websocket.TextMessage, msg)
	}
	log.Printf("Finnhub: unsubscribed from %s", symbol)
}
