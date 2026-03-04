import { create } from "zustand";
import type { Position, OptionQuote } from "../types";
import { rest } from "../api/rest";

interface PositionState {
  positions: Position[];
  loading: boolean;
  fetchPositions: () => Promise<void>;
  setPositions: (positions: Position[]) => void;
  updatePositionPrice: (symbol: string, quote: OptionQuote) => void;
}

export const usePositionStore = create<PositionState>((set) => ({
  positions: [],
  loading: false,

  fetchPositions: async () => {
    set({ loading: true });
    try {
      const positions = await rest.getPositions();
      set({ positions, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setPositions: (positions) => set({ positions }),

  updatePositionPrice: (symbol, quote) =>
    set((state) => {
      const idx = state.positions.findIndex((p) => p.symbol === symbol);
      if (idx === -1) return state;

      const pos = state.positions[idx];
      const mid = (quote.bidPrice + quote.askPrice) / 2;
      if (mid <= 0) return state;

      const qty = parseFloat(pos.qty || "0");
      const avgEntry = parseFloat(pos.avg_entry_price || "0");
      if (avgEntry <= 0) return state;

      const costBasis = avgEntry * Math.abs(qty) * 100;
      const marketValue = mid * Math.abs(qty) * 100;
      const side = pos.side === "short" ? -1 : 1;
      const unrealizedPl = (marketValue - costBasis) * side;
      const unrealizedPlpc = costBasis > 0 ? unrealizedPl / costBasis : 0;

      const updated = [...state.positions];
      updated[idx] = {
        ...pos,
        current_price: mid.toString(),
        market_value: (marketValue * side).toString(),
        unrealized_pl: unrealizedPl.toString(),
        unrealized_plpc: unrealizedPlpc.toString(),
      };
      return { positions: updated };
    }),
}));
