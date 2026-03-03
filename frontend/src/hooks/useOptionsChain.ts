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

        // Strike range based on chainStrikesRange setting
        const strikePad = spotPrice * (chainStrikesRange / 100);

        const params: Record<string, string> = {
          expiration_gte: fmt(gte),
          expiration_lte: fmt(lte),
          strike_gte: (spotPrice - strikePad).toFixed(2),
          strike_lte: (spotPrice + strikePad).toFixed(2),
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
        const filtered: OptionChain = {};
        for (const [sym, snap] of Object.entries(data)) {
          const parsed = parseOCC(sym);
          if (parsed && parsed.expiration === bestExp) {
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
