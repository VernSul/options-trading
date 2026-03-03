import type {
  Account,
  Order,
  Position,
  SmartOrderRequest,
  CrossingAlert,
  OptionChain,
  Bar,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const rest = {
  getAccount: () => request<Account>("/api/account"),

  getPositions: () => request<Position[]>("/api/positions"),

  closePosition: (symbol: string, qty?: string) =>
    request<Order>(`/api/positions/${encodeURIComponent(symbol)}`, {
      method: "DELETE",
      body: qty ? JSON.stringify({ qty }) : undefined,
    }),

  getOrders: (status = "open") =>
    request<Order[]>(`/api/orders?status=${status}`),

  placeOrder: (order: SmartOrderRequest) =>
    request<Order>("/api/orders", {
      method: "POST",
      body: JSON.stringify(order),
    }),

  cancelOrder: (id: string) =>
    request<void>(`/api/orders/${id}`, { method: "DELETE" }),

  cancelAllOrders: () => request<void>("/api/orders", { method: "DELETE" }),

  getQuote: (symbol: string) =>
    request<{ bp: number; ap: number; bs: number; as: number; t: string }>(
      `/api/quote/${encodeURIComponent(symbol)}`
    ),

  getOptionChain: (symbol: string, params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<OptionChain>(
      `/api/options/chain/${encodeURIComponent(symbol)}${qs}`
    );
  },

  getBars: (symbol: string, timeframe = "1Min") =>
    request<Bar[]>(
      `/api/bars/${encodeURIComponent(symbol)}?timeframe=${timeframe}`
    ),

  subscribe: (symbols: string[], channel: string) =>
    request<{ status: string }>("/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ symbols, channel }),
    }),

  unsubscribe: (symbols: string[], channel: string) =>
    request<{ status: string }>("/api/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ symbols, channel }),
    }),

  getCrossings: () => request<CrossingAlert[]>("/api/crossing"),

  createCrossing: (alert: Omit<CrossingAlert, "id" | "triggered">) =>
    request<CrossingAlert>("/api/crossing", {
      method: "POST",
      body: JSON.stringify(alert),
    }),

  deleteCrossing: (id: string) =>
    request<void>(`/api/crossing/${id}`, { method: "DELETE" }),
};
