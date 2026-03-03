import { useEffect, useCallback, useRef } from "react";
import hotkeys from "hotkeys-js";
import { useOrderStore } from "../stores/useOrderStore";
import { usePositionStore } from "../stores/usePositionStore";
import { useMarketStore } from "../stores/useMarketStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useWSStore } from "../stores/useWSStore";
import { showToast } from "../components/common/Toast";
import type { SmartOrderRequest } from "../types";

const SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY", "QQQ"];

interface AutoOption {
  symbol: string;
  askPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  type: "C" | "P";
  strike: number;
}

export function useKeyboardShortcuts(
  onShowHelp: () => void,
  qtyRef: React.MutableRefObject<number>,
  autoCallOption: AutoOption | null,
  autoPutOption: AutoOption | null,
) {
  const { cancelAllOrders } = useOrderStore();
  const { positions, fetchPositions } = usePositionStore();
  const { currentSymbol, setSymbol } = useMarketStore();
  const symbolIndexRef = useRef(SYMBOLS.indexOf(currentSymbol));

  const buildOrder = useCallback(
    (option: AutoOption): SmartOrderRequest | null => {
      const settings = useSettingsStore.getState();
      const entryPrice = option.askPrice;
      if (entryPrice <= 0) return null;

      const qty = Math.floor(settings.dollarAmount / (entryPrice * 100));
      if (qty < 1) return null;

      const order: SmartOrderRequest = {
        symbol: option.symbol,
        qty,
        side: "buy",
        type: "market",
        positionIntent: "buy_to_open",
        timeInForce: "day",
      };

      if (settings.stopLossPercent > 0) {
        order.stopLoss = {
          stopPrice: (entryPrice * (1 - settings.stopLossPercent)).toFixed(2),
        };
      }

      if (settings.trailingStartPercent > 0 && settings.trailingOffsetPercent > 0) {
        order.trailingStop = {
          trailAmount: (entryPrice * settings.trailingOffsetPercent).toFixed(2),
          safetyStop: (
            entryPrice * (1 - settings.trailingStartPercent - settings.trailingOffsetPercent)
          ).toFixed(2),
        };
      }

      return order;
    },
    []
  );

  useEffect(() => {
    hotkeys.filter = () => true; // Allow in inputs too for Escape

    hotkeys("escape", (e) => {
      e.preventDefault();
      cancelAllOrders();
      showToast("Cancelled all orders", "info");
    });

    hotkeys("x", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      const wsActions = useWSStore.getState();
      const pos = positions.find((p) => p.symbol.startsWith(currentSymbol));
      if (!pos) {
        showToast("No position to close for " + currentSymbol, "error");
        return;
      }
      wsActions.closePosition(pos.symbol);
      showToast(`Closing: ${pos.symbol}`, "info");
    });

    hotkeys("b", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      if (!autoCallOption) {
        showToast("No call option selected", "error");
        return;
      }
      const order = buildOrder(autoCallOption);
      if (!order) {
        showToast("Cannot build call order (qty=0?)", "error");
        return;
      }
      useWSStore.getState().sendOrder(order);
      showToast(`BUY CALL: ${order.qty}x ${autoCallOption.symbol}`, "success");
    });

    hotkeys("p", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      if (!autoPutOption) {
        showToast("No put option selected", "error");
        return;
      }
      const order = buildOrder(autoPutOption);
      if (!order) {
        showToast("Cannot build put order (qty=0?)", "error");
        return;
      }
      useWSStore.getState().sendOrder(order);
      showToast(`BUY PUT: ${order.qty}x ${autoPutOption.symbol}`, "success");
    });

    hotkeys("s", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      useWSStore.getState().closeAllPositions();
      showToast("Closing all positions", "info");
    });

    hotkeys("tab", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      symbolIndexRef.current = (symbolIndexRef.current + 1) % SYMBOLS.length;
      setSymbol(SYMBOLS[symbolIndexRef.current]);
      showToast(`Symbol: ${SYMBOLS[symbolIndexRef.current]}`, "info");
    });

    hotkeys("shift+tab", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      symbolIndexRef.current =
        (symbolIndexRef.current - 1 + SYMBOLS.length) % SYMBOLS.length;
      setSymbol(SYMBOLS[symbolIndexRef.current]);
      showToast(`Symbol: ${SYMBOLS[symbolIndexRef.current]}`, "info");
    });

    hotkeys("?", (e) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      onShowHelp();
    });

    // Number keys for quick qty
    for (let i = 1; i <= 9; i++) {
      hotkeys(String(i), (e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        e.preventDefault();
        qtyRef.current = i;
        showToast(`Qty: ${i}`, "info");
      });
    }

    return () => {
      hotkeys.unbind("escape");
      hotkeys.unbind("x");
      hotkeys.unbind("b");
      hotkeys.unbind("p");
      hotkeys.unbind("s");
      hotkeys.unbind("tab");
      hotkeys.unbind("shift+tab");
      hotkeys.unbind("?");
      for (let i = 1; i <= 9; i++) hotkeys.unbind(String(i));
    };
  }, [
    cancelAllOrders,
    positions,
    currentSymbol,
    setSymbol,
    onShowHelp,
    qtyRef,
    autoCallOption,
    autoPutOption,
    buildOrder,
    fetchPositions,
  ]);
}
