import { useState } from "react";
import { useMarketStore } from "../../stores/useMarketStore";
import { useOptionsChain } from "../../hooks/useOptionsChain";
import { parseOCC } from "../../utils/occ";
import { formatPrice } from "../../utils/format";

interface Props {
  onSelectContract: (symbol: string, side: "buy" | "sell") => void;
}

export function OptionsChain({ onSelectContract }: Props) {
  const { currentSymbol } = useMarketStore();
  const { chain, loading, error, fetchChain } = useOptionsChain();
  const [expiration, setExpiration] = useState("");

  const handleFetch = () => {
    const params: Record<string, string> = {};
    if (expiration) params.expiration = expiration;
    fetchChain(currentSymbol, params);
  };

  // Group by strike, separate calls and puts
  const entries = Object.entries(chain);
  const parsed = entries.map(([sym, snap]) => ({
    sym,
    snap,
    info: parseOCC(sym),
  }));

  const calls = parsed
    .filter((p) => p.info?.type === "C")
    .sort((a, b) => (a.info?.strike ?? 0) - (b.info?.strike ?? 0));
  const puts = parsed
    .filter((p) => p.info?.type === "P")
    .sort((a, b) => (a.info?.strike ?? 0) - (b.info?.strike ?? 0));

  return (
    <div className="options-chain">
      <div className="chain-controls">
        <h3>Options Chain — {currentSymbol}</h3>
        <input
          type="date"
          value={expiration}
          onChange={(e) => setExpiration(e.target.value)}
          className="chain-date"
        />
        <button onClick={handleFetch} disabled={loading} className="btn">
          {loading ? "Loading..." : "Load Chain"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {entries.length > 0 && (
        <div className="chain-table-wrapper">
          <table className="chain-table">
            <thead>
              <tr>
                <th colSpan={4} className="calls-header">
                  CALLS
                </th>
                <th>Strike</th>
                <th colSpan={4} className="puts-header">
                  PUTS
                </th>
              </tr>
              <tr>
                <th>Bid</th>
                <th>Ask</th>
                <th>IV</th>
                <th>Delta</th>
                <th></th>
                <th>Delta</th>
                <th>IV</th>
                <th>Bid</th>
                <th>Ask</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => {
                const put = puts.find(
                  (p) => p.info?.strike === call.info?.strike
                );
                const strike = call.info?.strike ?? 0;
                return (
                  <tr key={strike}>
                    <td
                      className="clickable bid"
                      onClick={() => onSelectContract(call.sym, "sell")}
                    >
                      {formatPrice(call.snap.latestQuote?.bp)}
                    </td>
                    <td
                      className="clickable ask"
                      onClick={() => onSelectContract(call.sym, "buy")}
                    >
                      {formatPrice(call.snap.latestQuote?.ap)}
                    </td>
                    <td>{call.snap.impliedVolatility?.toFixed(1) ?? "—"}%</td>
                    <td>{call.snap.greeks?.delta?.toFixed(3) ?? "—"}</td>
                    <td className="strike">{strike.toFixed(2)}</td>
                    <td>{put?.snap.greeks?.delta?.toFixed(3) ?? "—"}</td>
                    <td>
                      {put?.snap.impliedVolatility?.toFixed(1) ?? "—"}%
                    </td>
                    <td
                      className="clickable bid"
                      onClick={() =>
                        put && onSelectContract(put.sym, "sell")
                      }
                    >
                      {put ? formatPrice(put.snap.latestQuote?.bp) : "—"}
                    </td>
                    <td
                      className="clickable ask"
                      onClick={() =>
                        put && onSelectContract(put.sym, "buy")
                      }
                    >
                      {put ? formatPrice(put.snap.latestQuote?.ap) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
