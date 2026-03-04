package tiingo

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const wsURL = "wss://api.tiingo.com/iex"

type wsMessage struct {
	Service     string          `json:"service"`
	MessageType string          `json:"messageType"`
	Data        json.RawMessage `json:"data"`
}

type Stream struct {
	apiKey  string
	conn    *websocket.Conn
	mu      sync.Mutex
	subs    map[string]bool
	cancel  context.CancelFunc
	OnTrade func(symbol string, price float64, volume int64, timestamp time.Time)
	OnQuote func(symbol string, bidPrice, askPrice float64, timestamp time.Time)
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

	if old != nil {
		old.Close()
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.conn = conn

	// Collect current subscriptions
	tickers := make([]string, 0, len(s.subs))
	for sym := range s.subs {
		tickers = append(tickers, strings.ToLower(sym))
	}
	s.mu.Unlock()

	// Subscribe with auth
	if len(tickers) > 0 {
		sub := map[string]interface{}{
			"eventName":     "subscribe",
			"authorization": s.apiKey,
			"eventData": map[string]interface{}{
				"thresholdLevel": 5,
				"tickers":        tickers,
			},
		}
		msg, _ := json.Marshal(sub)
		conn.WriteMessage(websocket.TextMessage, msg)
	}

	log.Println("Tiingo: connected")
	return nil
}

func (s *Stream) runLoop(ctx context.Context) {
	for {
		err := s.readUntilError(ctx)
		if err == nil {
			return
		}
		log.Printf("Tiingo: read error: %v", err)

		if !s.reconnectLoop(ctx) {
			return
		}
	}
}

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

		if msg.MessageType != "A" {
			continue
		}

		// Data is an array: [updateType, timestamp, ticker, ...]
		var arr []json.RawMessage
		if err := json.Unmarshal(msg.Data, &arr); err != nil || len(arr) < 4 {
			continue
		}

		var updateType string
		if err := json.Unmarshal(arr[0], &updateType); err != nil {
			continue
		}

		var tsStr string
		if err := json.Unmarshal(arr[1], &tsStr); err != nil {
			continue
		}
		ts, _ := time.Parse(time.RFC3339Nano, tsStr)

		var ticker string
		if err := json.Unmarshal(arr[2], &ticker); err != nil {
			continue
		}
		ticker = strings.ToUpper(ticker)

		switch updateType {
		case "T":
			// Trade: ["T", timestamp, ticker, lastSaleTimestamp, lastPrice, lastSize, halted]
			if len(arr) < 7 {
				continue
			}
			var price float64
			var size int64
			json.Unmarshal(arr[4], &price)
			json.Unmarshal(arr[5], &size)
			if s.OnTrade != nil && price > 0 {
				s.OnTrade(ticker, price, size, ts)
			}

		case "Q":
			// Quote: ["Q", timestamp, ticker, bidSize, bidPrice, midPrice, askPrice, askSize]
			if len(arr) < 8 {
				continue
			}
			var bidPrice, askPrice float64
			json.Unmarshal(arr[4], &bidPrice)
			json.Unmarshal(arr[6], &askPrice)
			if s.OnQuote != nil && bidPrice > 0 && askPrice > 0 {
				s.OnQuote(ticker, bidPrice, askPrice, ts)
			}
		}
	}
}

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
		log.Printf("Tiingo: reconnecting in %v (attempt %d)", delay, attempt)

		select {
		case <-ctx.Done():
			return false
		case <-time.After(delay):
		}

		if err := s.dial(); err != nil {
			log.Printf("Tiingo: reconnect failed: %v", err)
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
		sub := map[string]interface{}{
			"eventName":     "subscribe",
			"authorization": s.apiKey,
			"eventData": map[string]interface{}{
				"thresholdLevel": 5,
				"tickers":        []string{strings.ToLower(symbol)},
			},
		}
		msg, _ := json.Marshal(sub)
		conn.WriteMessage(websocket.TextMessage, msg)
	}
	log.Printf("Tiingo: subscribed to %s", symbol)
}

func (s *Stream) Unsubscribe(symbol string) {
	s.mu.Lock()
	delete(s.subs, symbol)
	conn := s.conn
	s.mu.Unlock()

	if conn != nil {
		unsub := map[string]interface{}{
			"eventName":     "unsubscribe",
			"authorization": s.apiKey,
			"eventData": map[string]interface{}{
				"tickers": []string{strings.ToLower(symbol)},
			},
		}
		msg, _ := json.Marshal(unsub)
		conn.WriteMessage(websocket.TextMessage, msg)
	}
	log.Printf("Tiingo: unsubscribed from %s", symbol)
}
