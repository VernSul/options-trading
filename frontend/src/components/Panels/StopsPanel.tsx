import { useEffect } from "react";
import { useStopStore } from "../../stores/useStopStore";
import { occCompact } from "../../utils/occ";
import { CollapsiblePanel } from "../common/CollapsiblePanel";

function fmtPrice(val: string): string {
  const n = parseFloat(val);
  return isNaN(n) || n === 0 ? "—" : `$${n.toFixed(2)}`;
}

function fmtPct(val: string): string {
  const n = parseFloat(val);
  return isNaN(n) || n === 0 ? "—" : `${(n * 100).toFixed(0)}%`;
}

export function StopsPanel() {
  const { stops, fetchStops } = useStopStore();

  useEffect(() => {
    fetchStops();
    const interval = setInterval(fetchStops, 10_000);
    return () => clearInterval(interval);
  }, [fetchStops]);

  if (stops.length === 0) return null;

  return (
    <CollapsiblePanel id="stops" title="Stop Monitor" className="stops-panel">
      <div className="panel-table-wrap">
      <table className="panel-table">
        <thead>
          <tr>
            <th>Option</th>
            <th>Entry</th>
            <th>Safety</th>
            <th>HW</th>
            <th>Stop</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((s) => {
            const occ = occCompact(s.symbol);
            const hasTrailing = parseFloat(s.startPercent) < 100;
            const safetyPrice = fmtPrice(s.safetyStop);
            const hwPrice = fmtPrice(s.highWater);
            const stopPrice = fmtPrice(s.stopPrice);

            let status: string;
            let statusClass: string;
            if (s.fired) {
              status = "Fired";
              statusClass = "exit-stoploss";
            } else if (s.active) {
              status = `Trail ${fmtPct(s.offsetPercent)}`;
              statusClass = "exit-trailing";
            } else if (hasTrailing) {
              status = `Wait ${fmtPct(s.startPercent)}`;
              statusClass = "exit-manual";
            } else {
              status = "SL active";
              statusClass = "exit-stoploss";
            }

            return (
              <tr key={s.orderId}>
                <td title={s.symbol}>
                  {occ ? (
                    <span className={occ.typeClass}>{occ.label}</span>
                  ) : (
                    <span className="symbol">{s.symbol}</span>
                  )}
                </td>
                <td>{fmtPrice(s.entryPrice)}</td>
                <td className="exit-stoploss">{safetyPrice}</td>
                <td>{hwPrice}</td>
                <td className={s.active ? "exit-trailing" : ""}>{stopPrice}</td>
                <td className={statusClass}>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </CollapsiblePanel>
  );
}
