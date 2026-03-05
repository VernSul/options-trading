import { useState, useEffect, useCallback } from "react";
import { rest } from "../../api/rest";
import { occCompact } from "../../utils/occ";
import type { TradeRecord } from "../../types";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
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

function exitLabel(reason: string): { text: string; cls: string } {
  switch (reason) {
    case "trailing": return { text: "Trail", cls: "exit-trailing" };
    case "stop_loss": return { text: "SL", cls: "exit-stoploss" };
    case "manual": return { text: "Manual", cls: "exit-manual" };
    default: return { text: "—", cls: "" };
  }
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
              <th>Option</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>P&L</th>
              <th>Via</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => {
              const pnl = parseFloat(t.pnl || "0");
              const plClass = t.status === "open" ? "" : pnl >= 0 ? "positive" : "negative";
              const occ = occCompact(t.symbol);
              const exit = exitLabel(t.exitReason);
              return (
                <tr key={`${t.entryOrderId}-${i}`} className={t.status === "open" ? "trade-open" : ""}>
                  <td title={t.symbol}>
                    {occ ? (
                      <span className={occ.typeClass}>{occ.label}</span>
                    ) : (
                      <span className="symbol">{t.symbol}</span>
                    )}
                  </td>
                  <td>{t.qty}</td>
                  <td>${parseFloat(t.entryPrice).toFixed(2)}</td>
                  <td>{t.exitPrice ? `$${parseFloat(t.exitPrice).toFixed(2)}` : "—"}</td>
                  <td className={plClass}>
                    {formatPL(t.pnl)}{" "}
                    <span className="pct">{formatPct(t.pnlPercent)}</span>
                  </td>
                  <td className={exit.cls}>{exit.text}</td>
                  <td>{formatTime(t.exitTime || t.entryTime)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
