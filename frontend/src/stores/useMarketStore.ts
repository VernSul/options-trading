import { create } from "zustand";
import type { Bar, StockQuote, OptionQuote } from "../types";

interface MarketState {
  currentSymbol: string;
  bars: Bar[];
  latestQuote: StockQuote | null;
  optionQuotes: Record<string, OptionQuote>;
  setSymbol: (symbol: string) => void;
  setBars: (bars: Bar[]) => void;
  addBar: (bar: Bar) => void;
  setLatestQuote: (quote: StockQuote) => void;
  setOptionQuote: (quote: OptionQuote) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  currentSymbol: "SPY",
  bars: [],
  latestQuote: null,
  optionQuotes: {},

  setSymbol: (symbol) => set({ currentSymbol: symbol, bars: [], latestQuote: null }),

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
}));
