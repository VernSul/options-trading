import { create } from "zustand";
import type { Position } from "../types";
import { rest } from "../api/rest";

interface PositionState {
  positions: Position[];
  loading: boolean;
  fetchPositions: () => Promise<void>;
  setPositions: (positions: Position[]) => void;
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
}));
