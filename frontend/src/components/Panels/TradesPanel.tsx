import { useState, useEffect, useCallback } from "react";
import { rest } from "../../api/rest";
import type { TradeRecord } from "../../types";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPL(val: string | null): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${n.toFixed(0)}`;
}

function formatPct(val: string | null): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function intentLabel(intent: string): string {
  if (intent === "buy_to_open") return "Long";
  if (intent === "sell_to_open") return "Short";
  return intent;
}

export function TradesPanel() {
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rest.getTrades();
      setTrades(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 60_000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  const closedTrades = trades.filter((t) => t.status === "closed");
  const totalPnL = closedTrades.reduce((sum, t) => sum + parseFloat(t.pnl || "0"), 0);

  return (
    <div className="panel trades-panel">
      <div className="panel-header">
        <h3>
          Trades {loading && <span className="loading">...</span>}
          {closedTrades.length > 0 && (
            <span className={`trades-total ${totalPnL >= 0 ? "positive" : "negative"}`}>
              {" "}({formatPL(String(totalPnL))})
            </span>
          )}
        </h3>
        <button className="btn btn-small" onClick={fetchTrades}>Refresh</button>
      </div>
      {trades.length === 0 ? (
        <div className="empty">No trades</div>
      ) : (
        <table className="panel-table trades-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Dir</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>P&L</th>
              <th>%</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => {
              const pnl = parseFloat(t.pnl || "0");
              const plClass = t.status === "open" ? "" : pnl >= 0 ? "positive" : "negative";
              return (
                <tr key={`${t.entryOrderId}-${i}`} className={t.status === "open" ? "trade-open" : ""}>
                  <td className="symbol" title={t.symbol}>{t.symbol}</td>
                  <td>{intentLabel(t.positionIntent)}</td>
                  <td>{t.qty}</td>
                  <td>${parseFloat(t.entryPrice).toFixed(2)}</td>
                  <td>{t.exitPrice ? `$${parseFloat(t.exitPrice).toFixed(2)}` : "—"}</td>
                  <td className={plClass}>{formatPL(t.pnl)}</td>
                  <td className={plClass}>{formatPct(t.pnlPercent)}</td>
                  <td title={t.entryTime}>
                    {formatDate(t.entryTime)} {formatTime(t.exitTime || t.entryTime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
