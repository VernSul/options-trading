import { create } from "zustand";
import type { TrailingStopUpdate } from "../types";
import { rest } from "../api/rest";

interface StopState {
  stops: TrailingStopUpdate[];
  fetchStops: () => Promise<void>;
  upsertStop: (stop: TrailingStopUpdate) => void;
  removeStop: (orderId: string) => void;
}

export const useStopStore = create<StopState>((set) => ({
  stops: [],

  fetchStops: async () => {
    try {
      const stops = await rest.getStops();
      set({ stops: stops || [] });
    } catch {
      // silent
    }
  },

  upsertStop: (stop) =>
    set((state) => {
      const idx = state.stops.findIndex((s) => s.orderId === stop.orderId);
      if (idx >= 0) {
        const updated = [...state.stops];
        updated[idx] = stop;
        return { stops: updated };
      }
      return { stops: [...state.stops, stop] };
    }),

  removeStop: (orderId) =>
    set((state) => ({
      stops: state.stops.filter((s) => s.orderId !== orderId),
    })),
}));
