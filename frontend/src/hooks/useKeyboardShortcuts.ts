import { useEffect, useCallback, useRef } from "react";
import hotkeys from "hotkeys-js";
import { useOrderStore } from "../stores/useOrderStore";
import { usePositionStore } from "../stores/usePositionStore";
import { useMarketStore } from "../stores/useMarketStore";
import { rest } from "../api/rest";
import { showToast } from "../components/common/Toast";

const SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY", "QQQ"];

export function useKeyboardShortcuts(
  onShowHelp: () => void,
  qtyRef: React.MutableRefObject<number>
) {
  const { cancelAllOrders } = useOrderStore();
  const { positions, fetchPositions } = usePositionStore();
  const { currentSymbol, setSymbol } = useMarketStore();
  const symbolIndexRef = useRef(SYMBOLS.indexOf(currentSymbol));

  const closeCurrentPosition = useCallback(async () => {
    const pos = positions.find((p) => p.symbol.startsWith(currentSymbol));
    if (!pos) {
      showToast("No position to close for " + currentSymbol, "error");
      return;
    }
    try {
      await rest.closePosition(pos.symbol);
      showToast(`Closed position: ${pos.symbol}`, "success");
      fetchPositions();
    } catch (e) {
      showToast(
        `Close failed: ${e instanceof Error ? e.message : "unknown"}`,
        "error"
      );
    }
  }, [positions, currentSymbol, fetchPositions]);

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
      closeCurrentPosition();
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
      hotkeys.unbind("tab");
      hotkeys.unbind("shift+tab");
      hotkeys.unbind("?");
      for (let i = 1; i <= 9; i++) hotkeys.unbind(String(i));
    };
  }, [cancelAllOrders, closeCurrentPosition, setSymbol, onShowHelp, qtyRef]);
}
