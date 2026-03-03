import { useEffect, useRef, useCallback } from "react";
import { useMarketStore } from "../stores/useMarketStore";
import { useOrderStore } from "../stores/useOrderStore";
import { usePositionStore } from "../stores/usePositionStore";
import { useCrossingStore } from "../stores/useCrossingStore";
import type { WSMessage, TradeUpdate } from "../types";
import { normalizeBar, normalizeStockQuote, normalizeOptionQuote } from "../utils/normalize";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8080/ws";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { addBar, setLatestQuote, setOptionQuote, currentSymbol } =
    useMarketStore();
  const { updateOrder, fetchOrders } = useOrderStore();
  const { fetchPositions } = usePositionStore();
  const { markTriggered } = useCrossingStore();

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
              fetchPositions();
            }
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
    fetchPositions,
    markTriggered,
    currentSymbol,
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
