import { useState, useCallback } from "react";
import type { OptionChain } from "../types";
import { rest } from "../api/rest";

export function useOptionsChain() {
  const [chain, setChain] = useState<OptionChain>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChain = useCallback(
    async (symbol: string, params?: Record<string, string>) => {
      setLoading(true);
      setError(null);
      try {
        const data = await rest.getOptionChain(symbol, params);
        setChain(data || {});
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch chain");
        setChain({});
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { chain, loading, error, fetchChain };
}
