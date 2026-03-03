import { useState, useCallback } from "react";
import type { OptionChain } from "../types";
import { rest } from "../api/rest";
import { parseOCC } from "../utils/occ";

interface UseOptionsChainResult {
  chain: OptionChain;
  loading: boolean;
  error: string | null;
  selectedExpiration: string;
  availableExpirations: string[];
  fetchChain: (
    symbol: string,
    spotPrice: number,
    defaultExpDays: number,
    chainStrikesRange: number
  ) => Promise<void>;
  setSelectedExpiration: (exp: string) => void;
}

export function useOptionsChain(): UseOptionsChainResult {
  const [chain, setChain] = useState<OptionChain>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiration, setSelectedExpiration] = useState("");
  const [availableExpirations, setAvailableExpirations] = useState<string[]>(
    []
  );

  const fetchChain = useCallback(
    async (
      symbol: string,
      spotPrice: number,
      defaultExpDays: number,
      chainStrikesRange: number
    ) => {
      setLoading(true);
      setError(null);
      try {
        // Compute target expiration window
        const now = new Date();
        const target = new Date(now);
        target.setDate(target.getDate() + defaultExpDays);

        const gte = new Date(target);
        gte.setDate(gte.getDate() - 3);
        const lte = new Date(target);
        lte.setDate(lte.getDate() + 3);

        const fmt = (d: Date) => d.toISOString().split("T")[0];

        // Fetch a broad range — no strike_gte/strike_lte
        const params: Record<string, string> = {
          expiration_gte: fmt(gte),
          expiration_lte: fmt(lte),
        };

        const data = await rest.getOptionChain(symbol, params);
        if (!data || Object.keys(data).length === 0) {
          setChain({});
          setAvailableExpirations([]);
          setSelectedExpiration("");
          return;
        }

        // Extract unique expirations from OCC symbols
        const expirations = new Set<string>();
        for (const sym of Object.keys(data)) {
          const parsed = parseOCC(sym);
          if (parsed) expirations.add(parsed.expiration);
        }

        const sortedExps = Array.from(expirations).sort();
        setAvailableExpirations(sortedExps);

        // Pick closest expiration to target
        const targetStr = fmt(target);
        let bestExp = sortedExps[0];
        let bestDiff = Infinity;
        for (const exp of sortedExps) {
          const diff = Math.abs(
            new Date(exp).getTime() - new Date(targetStr).getTime()
          );
          if (diff < bestDiff) {
            bestDiff = diff;
            bestExp = exp;
          }
        }

        setSelectedExpiration(bestExp);

        // Filter chain to single expiration
        const expFiltered: OptionChain = {};
        for (const [sym, snap] of Object.entries(data)) {
          const parsed = parseOCC(sym);
          if (parsed && parsed.expiration === bestExp) {
            expFiltered[sym] = snap;
          }
        }

        // Count-based strike filtering: find ATM, keep ±chainStrikesRange strikes
        const strikes = new Set<number>();
        for (const sym of Object.keys(expFiltered)) {
          const parsed = parseOCC(sym);
          if (parsed) strikes.add(parsed.strike);
        }
        const sortedStrikes = Array.from(strikes).sort((a, b) => a - b);

        // Find ATM index
        let atmIdx = 0;
        let minDiff2 = Infinity;
        for (let i = 0; i < sortedStrikes.length; i++) {
          const diff = Math.abs(sortedStrikes[i] - spotPrice);
          if (diff < minDiff2) {
            minDiff2 = diff;
            atmIdx = i;
          }
        }

        const low = Math.max(0, atmIdx - chainStrikesRange);
        const high = Math.min(sortedStrikes.length - 1, atmIdx + chainStrikesRange);
        const allowedStrikes = new Set(sortedStrikes.slice(low, high + 1));

        const filtered: OptionChain = {};
        for (const [sym, snap] of Object.entries(expFiltered)) {
          const parsed = parseOCC(sym);
          if (parsed && allowedStrikes.has(parsed.strike)) {
            filtered[sym] = snap;
          }
        }

        setChain(filtered);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch chain");
        setChain({});
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    chain,
    loading,
    error,
    selectedExpiration,
    availableExpirations,
    fetchChain,
    setSelectedExpiration,
  };
}
