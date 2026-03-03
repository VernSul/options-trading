package orders

import (
	"fmt"
	"log"
	"sync"

	"github.com/shopspring/decimal"

	"github.com/alpacahq/alpaca-trade-api-go/v3/alpaca"
)

type CrossingEngine struct {
	mu        sync.Mutex
	trading   *alpaca.Client
	alerts    map[string]*CrossingAlert
	counter   int
	OnTriggered func(alert *CrossingAlert, order *alpaca.Order)
}

func NewCrossingEngine(trading *alpaca.Client) *CrossingEngine {
	return &CrossingEngine{
		trading: trading,
		alerts:  make(map[string]*CrossingAlert),
	}
}

func (ce *CrossingEngine) AddAlert(alert CrossingAlert) CrossingAlert {
	ce.mu.Lock()
	defer ce.mu.Unlock()
	ce.counter++
	alert.ID = fmt.Sprintf("cross-%d", ce.counter)
	alert.Triggered = false
	ce.alerts[alert.ID] = &alert
	log.Printf("Crossing alert added: id=%s underlying=%s threshold=%s direction=%s",
		alert.ID, alert.Underlying, alert.ThresholdPrice, alert.Direction)
	return alert
}

func (ce *CrossingEngine) GetAlerts() []CrossingAlert {
	ce.mu.Lock()
	defer ce.mu.Unlock()
	var result []CrossingAlert
	for _, a := range ce.alerts {
		result = append(result, *a)
	}
	return result
}

func (ce *CrossingEngine) RemoveAlert(id string) {
	ce.mu.Lock()
	defer ce.mu.Unlock()
	delete(ce.alerts, id)
}

// CheckPrice is called on every stock quote update to check crossing thresholds.
func (ce *CrossingEngine) CheckPrice(symbol string, price decimal.Decimal) {
	ce.mu.Lock()
	var toFire []*CrossingAlert
	for _, alert := range ce.alerts {
		if alert.Underlying != symbol || alert.Triggered {
			continue
		}
		crossed := false
		if alert.Direction == "above" && price.GreaterThanOrEqual(alert.ThresholdPrice) {
			crossed = true
		}
		if alert.Direction == "below" && price.LessThanOrEqual(alert.ThresholdPrice) {
			crossed = true
		}
		if crossed {
			alert.Triggered = true
			toFire = append(toFire, alert)
		}
	}
	ce.mu.Unlock()

	for _, alert := range toFire {
		go ce.fireOrder(alert)
	}
}

func (ce *CrossingEngine) fireOrder(alert *CrossingAlert) {
	qty := decimal.NewFromInt(int64(alert.Qty))

	orderReq := alpaca.PlaceOrderRequest{
		Symbol:         alert.OptionSymbol,
		Qty:            &qty,
		Side:           alpaca.Side(alert.Side),
		Type:           alpaca.OrderType(alert.OrderType),
		TimeInForce:    alpaca.Day,
		PositionIntent: alpaca.PositionIntent(alert.PositionIntent),
	}

	if alert.LimitPrice != nil {
		orderReq.LimitPrice = alert.LimitPrice
	}

	order, err := ce.trading.PlaceOrder(orderReq)
	if err != nil {
		log.Printf("Crossing order failed: id=%s err=%v", alert.ID, err)
		return
	}

	log.Printf("Crossing order placed: alert=%s order=%s symbol=%s", alert.ID, order.ID, alert.OptionSymbol)
	if ce.OnTriggered != nil {
		ce.OnTriggered(alert, order)
	}
}
