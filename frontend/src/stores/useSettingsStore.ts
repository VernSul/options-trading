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
  trailingStartPercent: number;
  trailingOffsetPercent: number;
  defaultTimeframe: Timeframe;
  chainStrikesRange: number;
  showProjections: boolean;
  currentSymbol: string;
  enableStopLoss: boolean;
  enableTrailing: boolean;

  setDefaultExpDays: (v: number) => void;
  setStrikeOffset: (v: number) => void;
  setStrikeOffsetType: (v: OffsetType) => void;
  setDefaultDirection: (v: Direction) => void;
  setDollarAmount: (v: number) => void;
  setStopLossPercent: (v: number) => void;
  setTrailingStartPercent: (v: number) => void;
  setTrailingOffsetPercent: (v: number) => void;
  setDefaultTimeframe: (v: Timeframe) => void;
  setChainStrikesRange: (v: number) => void;
  setShowProjections: (v: boolean) => void;
  setCurrentSymbol: (v: string) => void;
  setEnableStopLoss: (v: boolean) => void;
  setEnableTrailing: (v: boolean) => void;
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
      trailingStartPercent: 0.10,
      trailingOffsetPercent: 0.05,
      defaultTimeframe: "5Min",
      chainStrikesRange: 10,
      showProjections: true,
      currentSymbol: "SPY",
      enableStopLoss: true,
      enableTrailing: false,

      setDefaultExpDays: (v) => set({ defaultExpDays: v }),
      setStrikeOffset: (v) => set({ strikeOffset: v }),
      setStrikeOffsetType: (v) => set({ strikeOffsetType: v }),
      setDefaultDirection: (v) => set({ defaultDirection: v }),
      setDollarAmount: (v) => set({ dollarAmount: v }),
      setStopLossPercent: (v) => set({ stopLossPercent: v }),
      setTrailingStartPercent: (v) => set({ trailingStartPercent: v }),
      setTrailingOffsetPercent: (v) => set({ trailingOffsetPercent: v }),
      setDefaultTimeframe: (v) => set({ defaultTimeframe: v }),
      setChainStrikesRange: (v) => set({ chainStrikesRange: v }),
      setShowProjections: (v) => set({ showProjections: v }),
      setCurrentSymbol: (v) => set({ currentSymbol: v }),
      setEnableStopLoss: (v) => set({ enableStopLoss: v }),
      setEnableTrailing: (v) => set({ enableTrailing: v }),
    }),
    { name: "trading-settings" }
  )
);
