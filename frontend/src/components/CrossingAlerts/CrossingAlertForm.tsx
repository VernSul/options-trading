import { useState } from "react";
import { useCrossingStore } from "../../stores/useCrossingStore";
import { useMarketStore } from "../../stores/useMarketStore";

export function CrossingAlertForm() {
  const { currentSymbol } = useMarketStore();
  const { alerts, addAlert, removeAlert } = useCrossingStore();

  const [underlying, setUnderlying] = useState(currentSymbol);
  const [threshold, setThreshold] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [optionSymbol, setOptionSymbol] = useState("");
  const [qty, setQty] = useState(1);
  const [side, setSide] = useState("buy");
  const [positionIntent, setPositionIntent] = useState("buy_to_open");
  const [orderType, setOrderType] = useState("market");
  const [limitPrice, setLimitPrice] = useState("");

  const handleAdd = async () => {
    if (!underlying || !threshold || !optionSymbol) return;
    await addAlert({
      underlying,
      thresholdPrice: threshold,
      direction,
      optionSymbol,
      qty,
      side,
      positionIntent,
      orderType,
      ...(limitPrice ? { limitPrice } : {}),
    });
    setThreshold("");
    setOptionSymbol("");
  };

  return (
    <div className="crossing-alerts">
      <h3>Price Crossing Alerts</h3>

      <div className="crossing-form">
        <div className="form-row">
          <input
            type="text"
            value={underlying}
            onChange={(e) => setUnderlying(e.target.value.toUpperCase())}
            placeholder="Underlying"
            className="input"
          />
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "above" | "below")}
            className="select"
          >
            <option value="above">Crosses Above</option>
            <option value="below">Crosses Below</option>
          </select>
          <input
            type="text"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="Price"
            className="input"
          />
        </div>
        <div className="form-row">
          <input
            type="text"
            value={optionSymbol}
            onChange={(e) => setOptionSymbol(e.target.value.toUpperCase())}
            placeholder="Option symbol (OCC)"
            className="input"
          />
          <select
            value={side}
            onChange={(e) => setSide(e.target.value)}
            className="select"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <select
            value={positionIntent}
            onChange={(e) => setPositionIntent(e.target.value)}
            className="select"
          >
            <option value="buy_to_open">Buy to Open</option>
            <option value="sell_to_close">Sell to Close</option>
          </select>
        </div>
        <div className="form-row">
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value) || 1)}
            min={1}
            className="input qty-input"
          />
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            className="select"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
          {orderType === "limit" && (
            <input
              type="text"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder="Limit price"
              className="input"
            />
          )}
          <button onClick={handleAdd} className="btn">
            Add Alert
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Underlying</th>
              <th>Direction</th>
              <th>Price</th>
              <th>Option</th>
              <th>Action</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className={a.triggered ? "triggered" : ""}>
                <td>{a.underlying}</td>
                <td>{a.direction}</td>
                <td>{a.thresholdPrice}</td>
                <td className="symbol">{a.optionSymbol}</td>
                <td>
                  {a.side} {a.qty}x {a.orderType}
                </td>
                <td>{a.triggered ? "TRIGGERED" : "Active"}</td>
                <td>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => removeAlert(a.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
