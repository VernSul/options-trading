import { useEffect, useRef, useCallback } from "react";
import { useMarketStore } from "../stores/useMarketStore";
import { useOrderStore } from "../stores/useOrderStore";
import { usePositionStore } from "../stores/usePositionStore";
import { useAccountStore } from "../stores/useAccountStore";
import { useCrossingStore } from "../stores/useCrossingStore";
import { useWSStore } from "../stores/useWSStore";
import { showToast } from "../components/common/Toast";
import type { WSMessage, TradeUpdate, Position, Account, Order, SmartOrderRequest } from "../types";
import { normalizeBar, normalizeStockQuote, normalizeOptionQuote } from "../utils/normalize";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8080/ws";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { addBar, setLatestQuote, setOptionQuote, currentSymbol } =
    useMarketStore();
  const { updateOrder, fetchOrders, addOrder } = useOrderStore();
  const { setPositions, fetchPositions } = usePositionStore();
  const { fetchAccount } = useAccountStore();
  const { markTriggered } = useCrossingStore();
  const { setActions } = useWSStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WS connected");
      // Subscribe to current symbol bars + quotes
      if (currentSymbol) {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            symbols: [currentSymbol],
            channel: "bars",
          })
        );
        ws.send(
          JSON.stringify({
            type: "subscribe",
            symbols: [currentSymbol],
            channel: "quotes",
          })
        );
      }

      // Populate WS action store
      setActions({
        sendOrder: (order: SmartOrderRequest) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "place_order",
              payload: order,
            }));
          }
        },
        cancelOrder: (id: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "cancel_order",
              payload: { orderId: id },
            }));
          }
        },
        cancelAllOrders: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "cancel_all_orders" }));
          }
        },
        closePosition: (symbol: string, qty?: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "close_position",
              payload: { symbol, qty },
            }));
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
      try {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "bar":
            addBar(normalizeBar(msg.payload));
            break;
          case "stock_quote":
            setLatestQuote(normalizeStockQuote(msg.payload));
            break;
          case "option_quote":
            setOptionQuote(normalizeOptionQuote(msg.payload));
            break;
          case "trade_update": {
            const tu = msg.payload as TradeUpdate;
            updateOrder(tu.order);
            if (tu.event === "fill" || tu.event === "canceled") {
              fetchOrders();
            }
            break;
          }
          case "order_placed": {
            const order = msg.payload as Order;
            addOrder(order);
            break;
          }
          case "order_error": {
            const errData = msg.payload as { error: string; symbol?: string };
            showToast(`Order error: ${errData.error}`, "error");
            break;
          }
          case "positions_update": {
            const positions = msg.payload as Position[];
            setPositions(positions);
            break;
          }
          case "account_update": {
            const account = msg.payload as Account;
            useAccountStore.setState({ account });
            break;
          }
          case "crossing_triggered": {
            const data = msg.payload as { alert: { id: string } };
            markTriggered(data.alert.id);
            break;
          }
          case "heartbeat":
            break;
          default:
            break;
        }
      } catch (e) {
        console.error("WS message parse error:", e);
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
  }, [
    addBar,
    setLatestQuote,
    setOptionQuote,
    updateOrder,
    fetchOrders,
    addOrder,
    setPositions,
    fetchPositions,
    fetchAccount,
    markTriggered,
    currentSymbol,
    setActions,
  ]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

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
