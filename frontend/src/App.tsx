import { useState, useRef, useEffect, useCallback } from "react";
import { Chart } from "./components/Chart/Chart";
import { SymbolSearch } from "./components/SymbolSearch/SymbolSearch";
import { OptionsChain } from "./components/OptionsChain/OptionsChain";
import { OrderEntry } from "./components/OrderEntry/OrderEntry";
import { PositionsPanel } from "./components/Panels/PositionsPanel";
import { OrdersPanel } from "./components/Panels/OrdersPanel";
import { AccountPanel } from "./components/Panels/AccountPanel";
import { CrossingAlertForm } from "./components/CrossingAlerts/CrossingAlertForm";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { PnLProjection } from "./components/PnLProjection/PnLProjection";
import { KeyboardHelp } from "./components/KeyboardHelp/KeyboardHelp";
import { StatusBar } from "./components/common/StatusBar";
import { ToastContainer } from "./components/common/Toast";
import { useWebSocket } from "./hooks/useWebSocket";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCrossingStore } from "./stores/useCrossingStore";
import { useMarketStore } from "./stores/useMarketStore";
import { useSettingsStore } from "./stores/useSettingsStore";
import type { AutoSelectResult } from "./utils/optionSelector";

interface AutoOption {
  symbol: string;
  askPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  type: "C" | "P";
  strike: number;
}

function App() {
  const [showHelp, setShowHelp] = useState(false);
  const [selectedContract, setSelectedContract] = useState("");
  const [selectedSide, setSelectedSide] = useState<"buy" | "sell">("buy");
  const [autoOption, setAutoOption] = useState<AutoOption | null>(null);
  const qtyRef = useRef(1);

  useWebSocket();
  useKeyboardShortcuts(() => setShowHelp((v) => !v), qtyRef);

  const { fetchAlerts } = useCrossingStore();
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const { latestQuote, bars } = useMarketStore();
  const { dollarAmount } = useSettingsStore();

  // Spot price for PnL projection
  const spotPrice = latestQuote
    ? (latestQuote.bidPrice + latestQuote.askPrice) / 2
    : bars.length > 0
      ? bars[bars.length - 1].close
      : 0;

  const handleSelectContract = (symbol: string, side: "buy" | "sell") => {
    setSelectedContract(symbol);
    setSelectedSide(side);
  };

  const handleAutoSelect = useCallback((result: AutoSelectResult) => {
    setAutoOption({
      symbol: result.occSymbol,
      askPrice: result.askPrice,
      delta: result.delta,
      gamma: result.gamma,
      theta: result.theta,
      type: result.type,
      strike: result.strike,
    });
  }, []);

  // Compute qty for PnL projection
  const pnlQty =
    autoOption && autoOption.askPrice > 0
      ? Math.floor(dollarAmount / (autoOption.askPrice * 100))
      : 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Options Trading</h1>
        <SymbolSearch />
      </header>

      <main className="app-main">
        <div className="left-column">
          <Chart />
          <OptionsChain
            onSelectContract={handleSelectContract}
            onAutoSelect={handleAutoSelect}
          />
          {autoOption && spotPrice > 0 && pnlQty > 0 && (
            <PnLProjection
              delta={autoOption.delta}
              gamma={autoOption.gamma}
              theta={autoOption.theta}
              qty={pnlQty}
              entryPrice={autoOption.askPrice}
              spotPrice={spotPrice}
              optionType={autoOption.type}
            />
          )}
          <CrossingAlertForm />
        </div>

        <div className="right-column">
          <AccountPanel />
          <SettingsPanel />
          <OrderEntry
            prefillSymbol={selectedContract}
            prefillSide={selectedSide}
            autoSelectedSymbol={autoOption?.symbol}
            autoAskPrice={autoOption?.askPrice}
          />
          <PositionsPanel />
          <OrdersPanel />
        </div>
      </main>

      <StatusBar />
      <ToastContainer />
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

export default App;
