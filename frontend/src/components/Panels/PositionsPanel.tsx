import { useEffect } from "react";
import { usePositionStore } from "../../stores/usePositionStore";
import { useWSStore } from "../../stores/useWSStore";
import { formatPrice, formatPL, formatPercent, formatQty } from "../../utils/format";
import { showToast } from "../common/Toast";

export function PositionsPanel() {
  const { positions, loading, fetchPositions } = usePositionStore();
  const { closePosition, closeAllPositions } = useWSStore();

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const handleClose = (symbol: string) => {
    closePosition(symbol);
    showToast(`Closing ${symbol}`, "info");
  };

  const handleCloseAll = () => {
    closeAllPositions();
    showToast("Closing all positions", "info");
  };

  return (
    <div className="panel positions-panel">
      <div className="panel-header">
        <h3>Positions {loading && <span className="loading">...</span>}</h3>
        {positions.length > 0 && (
          <button className="btn btn-small btn-danger" onClick={handleCloseAll}>
            Close All
          </button>
        )}
      </div>
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
