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
      set({ orders, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addOrder: (order) =>
    set((state) => ({ orders: [order, ...state.orders] })),

  updateOrder: (order) =>
    set((state) => ({
      orders: state.orders.map((o) => (o.id === order.id ? order : o)),
    })),

  cancelOrder: (id) => {
    useWSStore.getState().cancelOrder(id);
  },

  cancelAllOrders: () => {
    useWSStore.getState().cancelAllOrders();
  },
}));
