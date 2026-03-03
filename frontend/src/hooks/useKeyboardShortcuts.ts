import { useEffect, useRef } from "react";
import hotkeys from "hotkeys-js";
import { useMarketStore } from "../stores/useMarketStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useWSStore } from "../stores/useWSStore";
import { useOrderStore } from "../stores/useOrderStore";
import { usePositionStore } from "../stores/usePositionStore";
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

function buildOrder(option: AutoOption): SmartOrderRequest | null {
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
}

export function useKeyboardShortcuts(
  onShowHelp: () => void,
  qtyRef: React.MutableRefObject<number>,
  autoCallOption: AutoOption | null,
  autoPutOption: AutoOption | null,
) {
  // Store all changing values in refs so hotkeys handlers always see latest
  const callRef = useRef(autoCallOption);
  const putRef = useRef(autoPutOption);
  const showHelpRef = useRef(onShowHelp);
  const symbolIndexRef = useRef(SYMBOLS.indexOf(useMarketStore.getState().currentSymbol));

  // Keep refs in sync
  useEffect(() => { callRef.current = autoCallOption; }, [autoCallOption]);
  useEffect(() => { putRef.current = autoPutOption; }, [autoPutOption]);
  useEffect(() => { showHelpRef.current = onShowHelp; }, [onShowHelp]);

  // Register hotkeys ONCE on mount, read latest values from refs/stores
  useEffect(() => {
    hotkeys.filter = () => true;

    const isInput = (e: KeyboardEvent) =>
      (e.target as HTMLElement).tagName === "INPUT" ||
      (e.target as HTMLElement).tagName === "TEXTAREA" ||
      (e.target as HTMLElement).tagName === "SELECT";

    hotkeys("escape", (e) => {
      e.preventDefault();
      useOrderStore.getState().cancelAllOrders();
      showToast("Cancelled all orders", "info");
    });

    hotkeys("b", (e) => {
      if (isInput(e)) return;
      e.preventDefault();
      const opt = callRef.current;
      if (!opt) {
        showToast("No call option selected", "error");
        return;
      }
      const order = buildOrder(opt);
      if (!order) {
        showToast("Cannot build call order (qty=0?)", "error");
        return;
      }
      useWSStore.getState().sendOrder(order);
      showToast(`BUY CALL: ${order.qty}x ${opt.symbol}`, "success");
    });

    hotkeys("p", (e) => {
      if (isInput(e)) return;
      e.preventDefault();
      const opt = putRef.current;
      if (!opt) {
        showToast("No put option selected", "error");
        return;
      }
      const order = buildOrder(opt);
      if (!order) {
        showToast("Cannot build put order (qty=0?)", "error");
        return;
      }
      useWSStore.getState().sendOrder(order);
      showToast(`BUY PUT: ${order.qty}x ${opt.symbol}`, "success");
    });

    hotkeys("s", (e) => {
      if (isInput(e)) return;
      e.preventDefault();
      useWSStore.getState().closeAllPositions();
      showToast("Closing all positions", "info");
    });

    hotkeys("x", (e) => {
      if (isInput(e)) return;
      e.preventDefault();
      const sym = useMarketStore.getState().currentSymbol;
      const positions = usePositionStore.getState().positions;
      const pos = positions.find((p) => p.symbol.startsWith(sym));
      if (!pos) {
        showToast("No position to close for " + sym, "error");
        return;
      }
      useWSStore.getState().closePosition(pos.symbol);
      showToast(`Closing: ${pos.symbol}`, "info");
    });

    hotkeys("tab", (e) => {
      if (isInput(e)) return;
      e.preventDefault();
      symbolIndexRef.current = (symbolIndexRef.current + 1) % SYMBOLS.length;
      useMarketStore.getState().setSymbol(SYMBOLS[symbolIndexRef.current]);
      showToast(`Symbol: ${SYMBOLS[symbolIndexRef.current]}`, "info");
    });

    hotkeys("shift+tab", (e) => {
      if (isInput(e)) return;
      e.preventDefault();
      symbolIndexRef.current = (symbolIndexRef.current - 1 + SYMBOLS.length) % SYMBOLS.length;
      useMarketStore.getState().setSymbol(SYMBOLS[symbolIndexRef.current]);
      showToast(`Symbol: ${SYMBOLS[symbolIndexRef.current]}`, "info");
    });

    hotkeys("?", (e) => {
      if (isInput(e)) return;
      e.preventDefault();
      showHelpRef.current();
    });

    for (let i = 1; i <= 9; i++) {
      hotkeys(String(i), (e) => {
        if (isInput(e)) return;
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
  }, [qtyRef]);
}
