import { useState } from "react";
import { rest } from "../../api/rest";
import { useOrderStore } from "../../stores/useOrderStore";
import type { SmartOrderRequest } from "../../types";

interface Props {
  prefillSymbol?: string;
  prefillSide?: "buy" | "sell";
}

export function OrderEntry({ prefillSymbol, prefillSide }: Props) {
  const [symbol, setSymbol] = useState(prefillSymbol || "");
  const [qty, setQty] = useState(1);
  const [side, setSide] = useState<string>(prefillSide || "buy");
  const [orderType, setOrderType] = useState("market");
  const [positionIntent, setPositionIntent] = useState("buy_to_open");
  const [limitPrice, setLimitPrice] = useState("");
  const [enableStopLoss, setEnableStopLoss] = useState(false);
  const [stopPrice, setStopPrice] = useState("");
  const [stopLimitPrice, setStopLimitPrice] = useState("");
  const [enableTrailing, setEnableTrailing] = useState(false);
  const [trailAmount, setTrailAmount] = useState("");
  const [safetyStop, setSafetyStop] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchOrders } = useOrderStore();

  // Update prefill when props change
  if (prefillSymbol && prefillSymbol !== symbol) setSymbol(prefillSymbol);
  if (prefillSide && prefillSide !== side) setSide(prefillSide);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const order: SmartOrderRequest = {
      symbol,
      qty,
      side,
      type: orderType,
      positionIntent,
      timeInForce: "day",
    };

    if (orderType === "limit" && limitPrice) {
      order.limitPrice = limitPrice;
    }

    if (enableStopLoss && stopPrice) {
      order.stopLoss = {
        stopPrice,
        ...(stopLimitPrice ? { limitPrice: stopLimitPrice } : {}),
      };
    }

    if (enableTrailing && trailAmount && safetyStop) {
      order.trailingStop = { trailAmount, safetyStop };
    }

    try {
      await rest.placeOrder(order);
      fetchOrders();
      setSymbol("");
      setLimitPrice("");
      setStopPrice("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="order-entry" onSubmit={handleSubmit}>
      <h3>Place Order</h3>

      <div className="form-row">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Option symbol (OCC)"
          className="input"
          required
        />
      </div>

      <div className="form-row">
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
          <option value="buy_to_close">Buy to Close</option>
          <option value="sell_to_open">Sell to Open</option>
          <option value="sell_to_close">Sell to Close</option>
        </select>
      </div>

      <div className="form-row">
        <label>
          Qty
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value) || 1)}
            min={1}
            className="input qty-input"
          />
        </label>

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
      </div>

      <div className="form-row checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={enableStopLoss}
            onChange={(e) => setEnableStopLoss(e.target.checked)}
          />
          Stop-Loss
        </label>
        {enableStopLoss && (
          <>
            <input
              type="text"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="Stop price"
              className="input"
            />
            <input
              type="text"
              value={stopLimitPrice}
              onChange={(e) => setStopLimitPrice(e.target.value)}
              placeholder="Limit (optional)"
              className="input"
            />
          </>
        )}
      </div>

      <div className="form-row checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={enableTrailing}
            onChange={(e) => setEnableTrailing(e.target.checked)}
          />
          Trailing Stop
        </label>
        {enableTrailing && (
          <>
            <input
              type="text"
              value={trailAmount}
              onChange={(e) => setTrailAmount(e.target.value)}
              placeholder="Trail amount ($)"
              className="input"
            />
            <input
              type="text"
              value={safetyStop}
              onChange={(e) => setSafetyStop(e.target.value)}
              placeholder="Safety stop ($)"
              className="input"
            />
          </>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <button
        type="submit"
        disabled={submitting || !symbol}
        className={`btn btn-order ${side === "buy" ? "btn-buy" : "btn-sell"}`}
      >
        {submitting
          ? "Submitting..."
          : `${side.toUpperCase()} ${qty} ${symbol || "..."}`}
      </button>
    </form>
  );
}
