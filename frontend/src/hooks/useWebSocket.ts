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

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentSymbolRef = useRef(useMarketStore.getState().currentSymbol);
  const positionSymsRef = useRef<Set<string>>(new Set());

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
            // Only update if quote matches the current symbol
            if (sq.symbol === useMarketStore.getState().currentSymbol) {
              useMarketStore.getState().setLatestQuote(sq);
            }
            break;
          }
          case "option_quote": {
            const oq: OptionQuote = normalizeOptionQuote(msg.payload);
            useMarketStore.getState().setOptionQuote(oq);
            // Update position P&L live from option quote mid-price
            usePositionStore.getState().updatePositionPrice(oq.symbol, oq);
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
          case "stop_loss_placed": {
            const data = msg.payload as { symbol: string; stopPrice: string };
            showToast(`Safety stop placed: ${data.symbol} @ $${data.stopPrice}`, "info");
            break;
          }
          case "heartbeat":
            break;
          default:
            break;
        }
      } catch {
        // Ignore synchronous render errors from Zustand store updates
      }
    };

    ws.onclose = () => {
      console.log("WS disconnected, reconnecting in 3s...");
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("WS error:", err);
      ws.close();
    };
  // No deps — connect once, use store.getState() for all state reads
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect once on mount
  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
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
