import { useState, useRef, useEffect } from "react";
import { Chart } from "./components/Chart/Chart";
import { SymbolSearch } from "./components/SymbolSearch/SymbolSearch";
import { OptionsChain } from "./components/OptionsChain/OptionsChain";
import { OrderEntry } from "./components/OrderEntry/OrderEntry";
import { PositionsPanel } from "./components/Panels/PositionsPanel";
import { OrdersPanel } from "./components/Panels/OrdersPanel";
import { AccountPanel } from "./components/Panels/AccountPanel";
import { CrossingAlertForm } from "./components/CrossingAlerts/CrossingAlertForm";
import { KeyboardHelp } from "./components/KeyboardHelp/KeyboardHelp";
import { StatusBar } from "./components/common/StatusBar";
import { ToastContainer } from "./components/common/Toast";
import { useWebSocket } from "./hooks/useWebSocket";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCrossingStore } from "./stores/useCrossingStore";

function App() {
  const [showHelp, setShowHelp] = useState(false);
  const [selectedContract, setSelectedContract] = useState("");
  const [selectedSide, setSelectedSide] = useState<"buy" | "sell">("buy");
  const qtyRef = useRef(1);

  useWebSocket();
  useKeyboardShortcuts(() => setShowHelp((v) => !v), qtyRef);

  const { fetchAlerts } = useCrossingStore();
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleSelectContract = (symbol: string, side: "buy" | "sell") => {
    setSelectedContract(symbol);
    setSelectedSide(side);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Options Trading</h1>
        <SymbolSearch />
      </header>

      <main className="app-main">
        <div className="left-column">
          <Chart />
          <OptionsChain onSelectContract={handleSelectContract} />
          <CrossingAlertForm />
        </div>

        <div className="right-column">
          <AccountPanel />
          <OrderEntry
            prefillSymbol={selectedContract}
            prefillSide={selectedSide}
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
