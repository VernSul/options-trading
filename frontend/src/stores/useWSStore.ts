import { create } from "zustand";
import type { SmartOrderRequest } from "../types";

interface WSActions {
  sendOrder: (order: SmartOrderRequest) => void;
  cancelOrder: (id: string) => void;
  cancelAllOrders: () => void;
  closePosition: (symbol: string, qty?: string) => void;
  closeAllPositions: () => void;
  setActions: (actions: Partial<Omit<WSActions, "setActions">>) => void;
}

const noop = () => {
  console.warn("WS not connected yet");
};

export const useWSStore = create<WSActions>((set) => ({
  sendOrder: noop as WSActions["sendOrder"],
  cancelOrder: noop as WSActions["cancelOrder"],
  cancelAllOrders: noop,
  closePosition: noop as WSActions["closePosition"],
  closeAllPositions: noop,
  setActions: (actions) => set(actions),
}));
