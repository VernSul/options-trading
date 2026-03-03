import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Direction = "call" | "put";
export type OffsetType = "OTM" | "ITM" | "ATM";
export type Timeframe = "1Min" | "5Min" | "15Min" | "1H" | "1D";

interface SettingsState {
  defaultExpDays: number;
  strikeOffset: number;
  strikeOffsetType: OffsetType;
  defaultDirection: Direction;
  dollarAmount: number;
  stopLossPercent: number;
  trailingStopPercent: number;
  defaultTimeframe: Timeframe;
  chainStrikesRange: number;

  setDefaultExpDays: (v: number) => void;
  setStrikeOffset: (v: number) => void;
  setStrikeOffsetType: (v: OffsetType) => void;
  setDefaultDirection: (v: Direction) => void;
  setDollarAmount: (v: number) => void;
  setStopLossPercent: (v: number) => void;
  setTrailingStopPercent: (v: number) => void;
  setDefaultTimeframe: (v: Timeframe) => void;
  setChainStrikesRange: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultExpDays: 7,
      strikeOffset: 2,
      strikeOffsetType: "OTM",
      defaultDirection: "call",
      dollarAmount: 500,
      stopLossPercent: 0.5,
      trailingStopPercent: 0.25,
      defaultTimeframe: "5Min",
      chainStrikesRange: 10,

      setDefaultExpDays: (v) => set({ defaultExpDays: v }),
      setStrikeOffset: (v) => set({ strikeOffset: v }),
      setStrikeOffsetType: (v) => set({ strikeOffsetType: v }),
      setDefaultDirection: (v) => set({ defaultDirection: v }),
      setDollarAmount: (v) => set({ dollarAmount: v }),
      setStopLossPercent: (v) => set({ stopLossPercent: v }),
      setTrailingStopPercent: (v) => set({ trailingStopPercent: v }),
      setDefaultTimeframe: (v) => set({ defaultTimeframe: v }),
      setChainStrikesRange: (v) => set({ chainStrikesRange: v }),
    }),
    { name: "trading-settings" }
  )
);
