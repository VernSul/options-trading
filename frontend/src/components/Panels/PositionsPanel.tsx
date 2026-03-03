import { useEffect } from "react";
import { usePositionStore } from "../../stores/usePositionStore";
import { rest } from "../../api/rest";
import { formatPrice, formatPL, formatPercent, formatQty } from "../../utils/format";

export function PositionsPanel() {
  const { positions, loading, fetchPositions } = usePositionStore();

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 10000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  const handleClose = async (symbol: string) => {
    if (!confirm(`Close entire position in ${symbol}?`)) return;
    try {
      await rest.closePosition(symbol);
      fetchPositions();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to close position");
    }
  };

  return (
    <div className="panel positions-panel">
      <h3>Positions {loading && <span className="loading">...</span>}</h3>
      {positions.length === 0 ? (
        <div className="empty">No open positions</div>
      ) : (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Avg Entry</th>
              <th>Current</th>
              <th>P&L</th>
              <th>P&L %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const pl = parseFloat(pos.unrealized_pl || "0");
              const plClass = pl >= 0 ? "positive" : "negative";
              return (
                <tr key={pos.symbol}>
                  <td className="symbol">{pos.symbol}</td>
                  <td>{formatQty(pos.qty)}</td>
                  <td>{formatPrice(pos.avg_entry_price)}</td>
                  <td>{formatPrice(pos.current_price)}</td>
                  <td className={plClass}>{formatPL(pos.unrealized_pl)}</td>
                  <td className={plClass}>
                    {formatPercent(pos.unrealized_plpc)}
                  </td>
                  <td>
                    <button
                      className="btn btn-small btn-sell"
                      onClick={() => handleClose(pos.symbol)}
                    >
                      Close
                    </button>
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
