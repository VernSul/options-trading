import { useState, useEffect } from "react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useWSStore } from "../../stores/useWSStore";
import { showToast } from "../common/Toast";
import type { SmartOrderRequest } from "../../types";

interface Props {
  prefillSymbol?: string;
  prefillSide?: "buy" | "sell";
  autoSelectedSymbol?: string;
  autoAskPrice?: number;
}

export function OrderEntry({
  prefillSymbol,
  prefillSide,
  autoSelectedSymbol,
  autoAskPrice,
}: Props) {
  const { dollarAmount, stopLossPercent, trailingStartPercent, trailingOffsetPercent } =
    useSettingsStore();
  const { sendOrder } = useWSStore();

  const [symbol, setSymbol] = useState(prefillSymbol || autoSelectedSymbol || "");
  const [side, setSide] = useState<string>(prefillSide || "buy");
  const [orderType, setOrderType] = useState("market");
  const [positionIntent, setPositionIntent] = useState("buy_to_open");
  const [limitPrice, setLimitPrice] = useState("");
  const [enableStopLoss, setEnableStopLoss] = useState(true);
  const [enableTrailing, setEnableTrailing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update symbol from prefill or auto-selection
  useEffect(() => {
    if (prefillSymbol) setSymbol(prefillSymbol);
    else if (autoSelectedSymbol) setSymbol(autoSelectedSymbol);
  }, [prefillSymbol, autoSelectedSymbol]);

  useEffect(() => {
    if (prefillSide) setSide(prefillSide);
  }, [prefillSide]);

  // Estimated entry price
  const entryPrice = autoAskPrice ?? (limitPrice ? parseFloat(limitPrice) : 0);

  // Compute qty from dollar amount (reads live from store)
  const computedQty =
    entryPrice > 0 ? Math.floor(dollarAmount / (entryPrice * 100)) : 0;

  // Compute absolute stop price (reads live from store)
  const computedStopPrice =
    entryPrice > 0 && enableStopLoss
      ? entryPrice * (1 - stopLossPercent)
      : 0;

  // Compute trail amount from new settings
  const computedTrailAmount =
    entryPrice > 0 && enableTrailing
      ? entryPrice * trailingOffsetPercent
      : 0;

  // Safety stop = entry * (1 - trailingStartPercent - some buffer)
  const computedSafetyStop =
    entryPrice > 0 && enableTrailing
      ? entryPrice * (1 - trailingStartPercent - trailingOffsetPercent)
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (computedQty < 1) {
      setError("Computed qty is 0 — increase $ amount or check ask price");
      return;
    }

    setSubmitting(true);

    const order: SmartOrderRequest = {
      symbol,
      qty: computedQty,
      side,
      type: orderType,
      positionIntent,
      timeInForce: "day",
    };

    if (orderType === "limit" && limitPrice) {
      order.limitPrice = limitPrice;
    }

    if (enableStopLoss && computedStopPrice > 0) {
      order.stopLoss = {
        stopPrice: computedStopPrice.toFixed(2),
      };
    }

    if (enableTrailing && computedTrailAmount > 0) {
      order.trailingStop = {
        trailAmount: computedTrailAmount.toFixed(2),
        safetyStop: computedSafetyStop > 0 ? computedSafetyStop.toFixed(2) : (entryPrice * 0.5).toFixed(2),
      };
    }

    try {
      sendOrder(order);
      showToast(`Order sent: ${side} ${computedQty} ${symbol}`, "success");
      setError(null);
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
        <label className="dollar-input-label">
          $
          <span style={{ fontWeight: 600, minWidth: 40 }}>{dollarAmount}</span>
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

      {entryPrice > 0 && (
        <div className="computed-qty">
          = {computedQty} contracts @ ${entryPrice.toFixed(2)}
        </div>
      )}

      <div className="form-row checkbox-row sl-config">
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
            <span>{(stopLossPercent * 100).toFixed(0)}%</span>
            {computedStopPrice > 0 && (
              <span className="computed-value">
                = ${computedStopPrice.toFixed(2)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="form-row checkbox-row sl-config">
        <label>
          <input
            type="checkbox"
            checked={enableTrailing}
            onChange={(e) => setEnableTrailing(e.target.checked)}
          />
          Trailing
        </label>
        {enableTrailing && (
          <>
            <span>
              Start {(trailingStartPercent * 100).toFixed(0)}% / Offset{" "}
              {(trailingOffsetPercent * 100).toFixed(0)}%
            </span>
            {computedTrailAmount > 0 && (
              <span className="computed-value">
                = ${computedTrailAmount.toFixed(2)} trail
              </span>
            )}
          </>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <button
        type="submit"
        disabled={submitting || !symbol || computedQty < 1}
        className={`btn btn-order ${side === "buy" ? "btn-buy" : "btn-sell"}`}
      >
        {submitting
          ? "Submitting..."
          : `${side.toUpperCase()} ${computedQty} ${symbol || "..."}`}
      </button>
    </form>
  );
}
