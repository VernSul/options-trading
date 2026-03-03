import { useEffect, useRef, useState, useCallback } from "react";
import { useMarketStore } from "../../stores/useMarketStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { useOptionsChain } from "../../hooks/useOptionsChain";
import { parseOCC } from "../../utils/occ";
import { formatPrice } from "../../utils/format";
import { rest } from "../../api/rest";
import type { OptionChain as OptionChainType } from "../../types";
import { autoSelectOption, type AutoSelectResult } from "../../utils/optionSelector";

interface Props {
  onSelectContract: (symbol: string, side: "buy" | "sell") => void;
  onAutoSelect?: (result: AutoSelectResult) => void;
}

export function OptionsChain({ onSelectContract, onAutoSelect }: Props) {
  const { currentSymbol, latestQuote, bars } = useMarketStore();
  const settings = useSettingsStore();
  const {
    chain,
    loading,
    error,
    selectedExpiration,
    availableExpirations,
    fetchChain,
    setSelectedExpiration,
  } = useOptionsChain();

  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const atmRowRef = useRef<HTMLTableRowElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Resolve spot price: from latestQuote, last bar, or REST fallback
  useEffect(() => {
    if (latestQuote) {
      const mid = (latestQuote.bidPrice + latestQuote.askPrice) / 2;
      if (mid > 0) {
        setSpotPrice(mid);
        return;
      }
    }
    if (bars.length > 0) {
      setSpotPrice(bars[bars.length - 1].close);
      return;
    }
    // Fallback: fetch quote via REST
    rest.getQuote(currentSymbol).then((q) => {
      if (q) {
        const mid = (q.bp + q.ap) / 2;
        if (mid > 0) setSpotPrice(mid);
      }
    }).catch(() => {});
  }, [currentSymbol, latestQuote, bars]);

  // Auto-fetch chain on symbol/spotPrice/settings change (debounced)
  useEffect(() => {
    if (!spotPrice || !currentSymbol) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchChain(
        currentSymbol,
        spotPrice,
        settings.defaultExpDays,
        settings.chainStrikesRange
      );
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    currentSymbol,
    spotPrice,
    settings.defaultExpDays,
    settings.chainStrikesRange,
    fetchChain,
  ]);

  // Auto-select option when chain + settings change
  const handleAutoSelect = useCallback(
    (chainData: OptionChainType, spot: number, exp: string) => {
      if (!onAutoSelect || Object.keys(chainData).length === 0) return;
      const result = autoSelectOption({
        spotPrice: spot,
        direction: settings.defaultDirection,
        strikeOffset: settings.strikeOffset,
        strikeOffsetType: settings.strikeOffsetType,
        chain: chainData,
        expiration: exp,
      });
      if (result) onAutoSelect(result);
    },
    [
      onAutoSelect,
      settings.defaultDirection,
      settings.strikeOffset,
      settings.strikeOffsetType,
    ]
  );

  useEffect(() => {
    if (spotPrice && selectedExpiration && Object.keys(chain).length > 0) {
      handleAutoSelect(chain, spotPrice, selectedExpiration);
    }
  }, [chain, spotPrice, selectedExpiration, handleAutoSelect]);

  // Auto-scroll to ATM row
  useEffect(() => {
    if (atmRowRef.current) {
      atmRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [chain, spotPrice]);

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

  // Find ATM strike
  const allStrikes = calls.map((c) => c.info?.strike ?? 0);
  let atmStrike = 0;
  if (spotPrice && allStrikes.length > 0) {
    let minDiff = Infinity;
    for (const s of allStrikes) {
      const diff = Math.abs(s - spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        atmStrike = s;
      }
    }
  }

  // Handle expiration change — re-filter chain from available data
  const handleExpirationChange = (exp: string) => {
    setSelectedExpiration(exp);
    // Re-fetch with new expiration context
    if (spotPrice && currentSymbol) {
      fetchChain(currentSymbol, spotPrice, settings.defaultExpDays, settings.chainStrikesRange);
    }
  };

  return (
    <div className="options-chain">
      <div className="chain-controls">
        <h3>Options Chain — {currentSymbol}</h3>
        {spotPrice && (
          <span className="spot-label">Spot: ${spotPrice.toFixed(2)}</span>
        )}
        {availableExpirations.length > 0 && (
          <select
            className="select"
            value={selectedExpiration}
            onChange={(e) => handleExpirationChange(e.target.value)}
            style={{ maxWidth: 140 }}
          >
            {availableExpirations.map((exp) => (
              <option key={exp} value={exp}>
                {exp}
              </option>
            ))}
          </select>
        )}
        {loading && <span className="loading">Loading...</span>}
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
                const isATM = strike === atmStrike;
                return (
                  <tr
                    key={strike}
                    ref={isATM ? atmRowRef : undefined}
                    className={isATM ? "atm-row" : ""}
                  >
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
