import { create } from "zustand";
import type { Order } from "../types";
import { rest } from "../api/rest";
import { useWSStore } from "./useWSStore";

interface OrderState {
  orders: Order[];
  loading: boolean;
  fetchOrders: () => Promise<void>;
  addOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  cancelOrder: (id: string) => void;
  cancelAllOrders: () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  loading: false,

  fetchOrders: async () => {
    set({ loading: true });
    try {
      const orders = await rest.getOrders();
      const open = orders.filter(
        (o) => !["filled", "canceled", "expired", "rejected", "replaced",
          "pending_cancel", "pending_replace"].includes(o.status)
      );
      set({ orders: open, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addOrder: (order) =>
    set((state) => {
      // Avoid duplicates
      if (state.orders.some((o) => o.id === order.id)) {
        return { orders: state.orders.map((o) => (o.id === order.id ? order : o)) };
      }
      return { orders: [order, ...state.orders] };
    }),

  updateOrder: (order) =>
    set((state) => {
      const terminal = ["filled", "canceled", "expired", "rejected", "replaced",
        "pending_cancel", "pending_replace"];
      if (terminal.includes(order.status)) {
        // Remove terminal/transitional orders from the list
        return { orders: state.orders.filter((o) => o.id !== order.id) };
      }
      return { orders: state.orders.map((o) => (o.id === order.id ? order : o)) };
    }),

  cancelOrder: (id) => {
    useWSStore.getState().cancelOrder(id);
  },

  cancelAllOrders: () => {
    useWSStore.getState().cancelAllOrders();
  },
}));
