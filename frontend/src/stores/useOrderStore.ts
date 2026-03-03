import { create } from "zustand";
import type { Order } from "../types";
import { rest } from "../api/rest";

interface OrderState {
  orders: Order[];
  loading: boolean;
  fetchOrders: () => Promise<void>;
  addOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  cancelOrder: (id: string) => Promise<void>;
  cancelAllOrders: () => Promise<void>;
}

export const useOrderStore = create<OrderState>((set, get) => ({
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

  cancelOrder: async (id) => {
    await rest.cancelOrder(id);
    get().fetchOrders();
  },

  cancelAllOrders: async () => {
    await rest.cancelAllOrders();
    set({ orders: [] });
  },
}));
