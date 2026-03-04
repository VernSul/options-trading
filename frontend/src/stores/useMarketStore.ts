import { create } from "zustand";
import type { Bar, StockQuote, OptionQuote } from "../types";
import { useSettingsStore } from "./useSettingsStore";

interface MarketState {
  currentSymbol: string;
  bars: Bar[];
  latestQuote: StockQuote | null;
  optionQuotes: Record<string, OptionQuote>;
  isStale: boolean;
  setSymbol: (symbol: string) => void;
  setBars: (bars: Bar[]) => void;
  addBar: (bar: Bar) => void;
  setLatestQuote: (quote: StockQuote) => void;
  setOptionQuote: (quote: OptionQuote) => void;
  setStale: (stale: boolean) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  currentSymbol: useSettingsStore.getState().currentSymbol || "SPY",
  bars: [],
  latestQuote: null,
  optionQuotes: {},
  isStale: false,

  setSymbol: (symbol) => {
    useSettingsStore.getState().setCurrentSymbol(symbol);
    set({ currentSymbol: symbol, bars: [], latestQuote: null });
  },

  setBars: (bars) => set({ bars }),

  addBar: (bar) =>
    set((state) => {
      const last = state.bars[state.bars.length - 1];
      if (last && last.timestamp === bar.timestamp) {
        return { bars: [...state.bars.slice(0, -1), bar] };
      }
      return { bars: [...state.bars, bar] };
    }),

  setLatestQuote: (quote) => set({ latestQuote: quote }),

  setOptionQuote: (quote) =>
    set((state) => ({
      optionQuotes: { ...state.optionQuotes, [quote.symbol]: quote },
    })),

  setStale: (stale) => set({ isStale: stale }),
}));
