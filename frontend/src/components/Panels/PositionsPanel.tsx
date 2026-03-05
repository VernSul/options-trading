import { useEffect } from "react";
import { usePositionStore } from "../../stores/usePositionStore";
import { useOrderStore } from "../../stores/useOrderStore";
import { useAccountStore } from "../../stores/useAccountStore";
import { useWSStore } from "../../stores/useWSStore";
import { formatPrice, formatPL, formatPercent, formatQty } from "../../utils/format";
import { occCompact } from "../../utils/occ";
import { showToast } from "../common/Toast";
import { CollapsiblePanel } from "../common/CollapsiblePanel";

export function PositionsPanel() {
  const { positions, loading, fetchPositions } = usePositionStore();
  const { closePosition, closeAllPositions, cancelAllOrders } = useWSStore();

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 30_000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  const refreshAll = () => {
    setTimeout(() => {
      fetchPositions();
      useOrderStore.getState().fetchOrders();
      useAccountStore.getState().fetchAccount();
    }, 1000);
    setTimeout(() => {
      fetchPositions();
      useOrderStore.getState().fetchOrders();
      useAccountStore.getState().fetchAccount();
    }, 3000);
  };

  const handleClose = (symbol: string) => {
    closePosition(symbol);
    showToast(`Closing ${symbol}`, "info");
    refreshAll();
  };

  const handleCloseAll = () => {
    cancelAllOrders();
    closeAllPositions();
    showToast("Cancelling orders & closing all positions", "info");
    refreshAll();
  };

  return (
    <CollapsiblePanel
      title={`Positions${loading ? " ..." : ""}`}
      className="positions-panel"
      headerRight={
        positions.length > 0 ? (
          <button
            className="btn btn-small btn-danger"
            onClick={(e) => { e.stopPropagation(); handleCloseAll(); }}
          >
            Close All
          </button>
        ) : undefined
      }
    >
      {positions.length === 0 ? (
        <div className="empty">No open positions</div>
      ) : (
        <div className="panel-table-wrap">
        <table className="panel-table">
          <thead>
            <tr>
              <th>Option</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Now</th>
              <th>P&L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const pl = parseFloat(pos.unrealized_pl || "0");
              const plClass = pl >= 0 ? "positive" : "negative";
              const occ = occCompact(pos.symbol);
              return (
                <tr key={pos.symbol}>
                  <td title={pos.symbol}>
                    {occ ? (
                      <span className={occ.typeClass}>{occ.label}</span>
                    ) : (
                      <span className="symbol">{pos.symbol}</span>
                    )}
                  </td>
                  <td>{formatQty(pos.qty)}</td>
                  <td>{formatPrice(pos.avg_entry_price)}</td>
                  <td>{formatPrice(pos.current_price)}</td>
                  <td className={plClass}>
                    {formatPL(pos.unrealized_pl)}{" "}
                    <span className="pct">{formatPercent(pos.unrealized_plpc)}</span>
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
        </div>
      )}
    </CollapsiblePanel>
  );
}
