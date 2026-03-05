import { useEffect, useRef, useCallback } from "react";
import { useMarketStore } from "../stores/useMarketStore";
import { useOrderStore } from "../stores/useOrderStore";
import { usePositionStore } from "../stores/usePositionStore";
import { useAccountStore } from "../stores/useAccountStore";
import { useCrossingStore } from "../stores/useCrossingStore";
import { useWSStore } from "../stores/useWSStore";
import { showToast } from "../components/common/Toast";
import type { WSMessage, TradeUpdate, Position, Account, Order, SmartOrderRequest, OptionQuote, TrailingStopUpdate } from "../types";
import { normalizeBar, normalizeStockQuote, normalizeOptionQuote } from "../utils/normalize";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8080/ws";
const STALE_THRESHOLD_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  // Weekend
  if (day === 0 || day === 6) return false;
  // Convert to ET (UTC-5 standard, UTC-4 DST) — approximate with UTC-4
  const etHour = (now.getUTCHours() - 4 + 24) % 24;
  const etMin = now.getUTCMinutes();
  const etTime = etHour * 60 + etMin;
  // Pre-market 4:00 ET to after-hours 20:00 ET
  return etTime >= 240 && etTime <= 1200;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectAttempt = useRef(0);
  const currentSymbolRef = useRef(useMarketStore.getState().currentSymbol);
  const positionSymsRef = useRef<Set<string>>(new Set());
  const lastQuoteTimeRef = useRef(0);
  const staleCheckTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Keep symbol ref in sync
  useEffect(() => {
    return useMarketStore.subscribe((state) => {
      currentSymbolRef.current = state.currentSymbol;
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WS connected");
      reconnectAttempt.current = 0;
      lastQuoteTimeRef.current = Date.now();
      useMarketStore.getState().setStale(false);

      const sym = currentSymbolRef.current;
      if (sym) {
        ws.send(JSON.stringify({ type: "subscribe", symbols: [sym], channel: "bars" }));
        ws.send(JSON.stringify({ type: "subscribe", symbols: [sym], channel: "quotes" }));
      }

      // Subscribe to option quotes for existing positions
      const posSyms = usePositionStore.getState().positions.map((p) => p.symbol);
      for (const psym of posSyms) {
        ws.send(JSON.stringify({ type: "subscribe", symbols: [psym], channel: "option_quotes" }));
      }
      positionSymsRef.current = new Set(posSyms);

      // Populate WS action store
      useWSStore.getState().setActions({
        sendOrder: (order: SmartOrderRequest) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "place_order", payload: order }));
          }
        },
        cancelOrder: (id: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "cancel_order", payload: { orderId: id } }));
          }
        },
        cancelAllOrders: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "cancel_all_orders" }));
          }
        },
        closePosition: (symbol: string, qty?: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "close_position", payload: { symbol, qty } }));
          }
        },
        closeAllPositions: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "close_all_positions" }));
          }
        },
      });
    };

    ws.onmessage = (event) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.error("WS JSON parse error:", e);
        return;
      }

      try {
        switch (msg.type) {
          case "bar": {
            const bar = normalizeBar(msg.payload);
            if (bar.symbol === useMarketStore.getState().currentSymbol) {
              useMarketStore.getState().addBar(bar);
            }
            break;
          }
          case "stock_quote": {
            const sq = normalizeStockQuote(msg.payload);
            if (sq.symbol === useMarketStore.getState().currentSymbol) {
              useMarketStore.getState().setLatestQuote(sq);
              lastQuoteTimeRef.current = Date.now();
              if (useMarketStore.getState().isStale) {
                useMarketStore.getState().setStale(false);
              }
            }
            break;
          }
          case "option_quote": {
            const oq: OptionQuote = normalizeOptionQuote(msg.payload);
            useMarketStore.getState().setOptionQuote(oq);
            usePositionStore.getState().updatePositionPrice(oq.symbol, oq);
            lastQuoteTimeRef.current = Date.now();
            if (useMarketStore.getState().isStale) {
              useMarketStore.getState().setStale(false);
            }
            break;
          }
          case "trade_update": {
            const tu = msg.payload as TradeUpdate;
            useOrderStore.getState().updateOrder(tu.order);
            if (tu.event === "fill" || tu.event === "canceled" || tu.event === "partial_fill") {
              useOrderStore.getState().fetchOrders();
              usePositionStore.getState().fetchPositions();
              useAccountStore.getState().fetchAccount();
            }
            break;
          }
          case "order_placed": {
            const order = msg.payload as Order;
            useOrderStore.getState().addOrder(order);
            break;
          }
          case "order_error": {
            const errData = msg.payload as { error: string; symbol?: string };
            showToast(`Order error: ${errData.error}`, "error");
            break;
          }
          case "positions_update": {
            const positions = msg.payload as Position[];
            usePositionStore.getState().setPositions(positions);
            break;
          }
          case "account_update": {
            const account = msg.payload as Account;
            useAccountStore.setState({ account });
            break;
          }
          case "crossing_triggered": {
            const data = msg.payload as { alert: { id: string } };
            useCrossingStore.getState().markTriggered(data.alert.id);
            break;
          }
          case "trailing_stop_update": {
            const ts = msg.payload as TrailingStopUpdate;
            if (ts.active) {
              showToast(`Trailing active: ${ts.symbol} HW=$${ts.highWater}`, "success");
            }
            break;
          }
          case "trailing_stop_fired": {
            const ts = msg.payload as TrailingStopUpdate;
            showToast(`Trailing fired — closing ${ts.symbol}`, "info");
            break;
          }
          case "heartbeat":
            lastQuoteTimeRef.current = Date.now();
            break;
          default:
            break;
        }
      } catch {
        // Ignore synchronous render errors from Zustand store updates
      }
    };

    ws.onclose = () => {
      const attempt = ++reconnectAttempt.current;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY_MS);
      console.log(`WS disconnected, reconnecting in ${delay}ms (attempt ${attempt})...`);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
      ws.close();
    };
  // No deps — connect once, use store.getState() for all state reads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect once on mount + stale-data checker
  useEffect(() => {
    connect();

    staleCheckTimer.current = setInterval(() => {
      if (!isMarketHours()) return;
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;

      const elapsed = Date.now() - lastQuoteTimeRef.current;
      if (elapsed > STALE_THRESHOLD_MS && !useMarketStore.getState().isStale) {
        useMarketStore.getState().setStale(true);
        showToast("Stale data — reconnecting stream", "error");
        // Force reconnect
        wsRef.current?.close();
      }
    }, 5000);

    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(staleCheckTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Re-subscribe when symbol changes
  useEffect(() => {
    return useMarketStore.subscribe((state, prev) => {
      if (state.currentSymbol !== prev.currentSymbol && wsRef.current?.readyState === WebSocket.OPEN) {
        const ws = wsRef.current;
        // Unsubscribe old
        if (prev.currentSymbol) {
          ws.send(JSON.stringify({ type: "unsubscribe", symbols: [prev.currentSymbol], channel: "bars" }));
          ws.send(JSON.stringify({ type: "unsubscribe", symbols: [prev.currentSymbol], channel: "quotes" }));
        }
        // Subscribe new
        ws.send(JSON.stringify({ type: "subscribe", symbols: [state.currentSymbol], channel: "bars" }));
        ws.send(JSON.stringify({ type: "subscribe", symbols: [state.currentSymbol], channel: "quotes" }));
      }
    });
  }, []);

  // Auto-subscribe to option quotes for open positions
  useEffect(() => {
    return usePositionStore.subscribe((state) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const newSyms = new Set(state.positions.map((p) => p.symbol));

      // Unsubscribe symbols no longer in positions
      for (const sym of positionSymsRef.current) {
        if (!newSyms.has(sym)) {
          ws.send(JSON.stringify({ type: "unsubscribe", symbols: [sym], channel: "option_quotes" }));
        }
      }
      // Subscribe new position symbols
      for (const sym of newSyms) {
        if (!positionSymsRef.current.has(sym)) {
          ws.send(JSON.stringify({ type: "subscribe", symbols: [sym], channel: "option_quotes" }));
        }
      }
      positionSymsRef.current = newSyms;
    });
  }, []);

  const send = useCallback(
    (type: string, symbols: string[], channel: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type, symbols, channel }));
      }
    },
    []
  );

  return { send };
}
