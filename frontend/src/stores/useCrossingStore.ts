import { create } from "zustand";
import type { CrossingAlert } from "../types";
import { rest } from "../api/rest";

interface CrossingState {
  alerts: CrossingAlert[];
  fetchAlerts: () => Promise<void>;
  addAlert: (alert: Omit<CrossingAlert, "id" | "triggered">) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  markTriggered: (id: string) => void;
}

export const useCrossingStore = create<CrossingState>((set) => ({
  alerts: [],

  fetchAlerts: async () => {
    const alerts = await rest.getCrossings();
    set({ alerts: alerts || [] });
  },

  addAlert: async (alert) => {
    const created = await rest.createCrossing(alert);
    set((state) => ({ alerts: [...state.alerts, created] }));
  },

  removeAlert: async (id) => {
    await rest.deleteCrossing(id);
    set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) }));
  },

  markTriggered: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, triggered: true } : a
      ),
    })),
}));
