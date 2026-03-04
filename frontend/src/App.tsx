import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Chart } from "./components/Chart/Chart";
import { SymbolSearch } from "./components/SymbolSearch/SymbolSearch";
import { OptionsChain } from "./components/OptionsChain/OptionsChain";
import { OrderEntry } from "./components/OrderEntry/OrderEntry";
import { PositionsPanel } from "./components/Panels/PositionsPanel";
import { OrdersPanel } from "./components/Panels/OrdersPanel";
import { AccountPanel } from "./components/Panels/AccountPanel";
import { CrossingAlertForm } from "./components/CrossingAlerts/CrossingAlertForm";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
// PnLProjection box removed — projection lines on chart are sufficient
import { KeyboardHelp } from "./components/KeyboardHelp/KeyboardHelp";
import { StatusBar } from "./components/common/StatusBar";
import { ToastContainer } from "./components/common/Toast";
import { useWebSocket } from "./hooks/useWebSocket";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCrossingStore } from "./stores/useCrossingStore";
import { useMarketStore } from "./stores/useMarketStore";
import { useSettingsStore } from "./stores/useSettingsStore";
import { autoSelectOption, type AutoSelectResult } from "./utils/optionSelector";
import type { OptionChain as OptionChainType } from "./types";

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
  const [autoCallOption, setAutoCallOption] = useState<AutoOption | null>(null);
  const [autoPutOption, setAutoPutOption] = useState<AutoOption | null>(null);
  const qtyRef = useRef(1);

  // The "main" auto-option follows the settings direction
  const settings = useSettingsStore();
  const autoOption = settings.defaultDirection === "call" ? autoCallOption : autoPutOption;

  useWebSocket();
  useKeyboardShortcuts(
    () => setShowHelp((v) => !v),
    qtyRef,
    autoCallOption,
    autoPutOption,
  );

  const { fetchAlerts } = useCrossingStore();
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const { latestQuote, bars } = useMarketStore();
  const { dollarAmount, stopLossPercent, trailingStartPercent, showProjections } = settings;

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

  // Handle auto-select for both call and put
  const [chainData, setChainData] = useState<{ chain: OptionChainType; spot: number; exp: string } | null>(null);

  const handleAutoSelect = useCallback((result: AutoSelectResult) => {
    const opt: AutoOption = {
      symbol: result.occSymbol,
      askPrice: result.askPrice,
      delta: result.delta,
      gamma: result.gamma,
      theta: result.theta,
      type: result.type,
      strike: result.strike,
    };
    if (result.type === "C") {
      setAutoCallOption(opt);
    } else {
      setAutoPutOption(opt);
    }
  }, []);

  // Dual auto-select: run for both call and put when chain updates
  const handleChainReady = useCallback(
    (chain: OptionChainType, spot: number, exp: string) => {
      setChainData({ chain, spot, exp });
    },
    []
  );

  useEffect(() => {
    if (!chainData) return;
    const { chain, spot, exp } = chainData;
    if (Object.keys(chain).length === 0) return;

    // Select call
    const callResult = autoSelectOption({
      spotPrice: spot,
      direction: "call",
      strikeOffset: settings.strikeOffset,
      strikeOffsetType: settings.strikeOffsetType,
      chain,
      expiration: exp,
    });
    if (callResult) {
      setAutoCallOption({
        symbol: callResult.occSymbol,
        askPrice: callResult.askPrice,
        delta: callResult.delta,
        gamma: callResult.gamma,
        theta: callResult.theta,
        type: callResult.type,
        strike: callResult.strike,
      });
    }

    // Select put
    const putResult = autoSelectOption({
      spotPrice: spot,
      direction: "put",
      strikeOffset: settings.strikeOffset,
      strikeOffsetType: settings.strikeOffsetType,
      chain,
      expiration: exp,
    });
    if (putResult) {
      setAutoPutOption({
        symbol: putResult.occSymbol,
        askPrice: putResult.askPrice,
        delta: putResult.delta,
        gamma: putResult.gamma,
        theta: putResult.theta,
        type: putResult.type,
        strike: putResult.strike,
      });
    }
  }, [chainData, settings.strikeOffset, settings.strikeOffsetType]);

  // Compute qty for PnL projection
  const pnlQty =
    autoOption && autoOption.askPrice > 0
      ? Math.floor(dollarAmount / (autoOption.askPrice * 100))
      : 0;

  // P&L projection lines for chart (optional via settings)
  const pnlProjections = useMemo(() => {
    if (!showProjections || !autoOption || spotPrice <= 0 || pnlQty <= 0) return undefined;
    const { delta, gamma } = autoOption;
    const moves = [-5, -3, -2, -1, 1, 2, 3, 5];
    return moves.map((move) => {
      const optionChange = delta * move + 0.5 * gamma * move * move;
      const totalPL = optionChange * 100 * pnlQty;
      const plPercent = autoOption.askPrice > 0
        ? (optionChange / autoOption.askPrice) * 100
        : 0;
      return {
        price: spotPrice + move,
        pl: totalPL,
        plPercent,
      };
    });
  }, [showProjections, autoOption, spotPrice, pnlQty]);

  // Stop-loss & trailing start underlying prices for chart
  const stopLossUnderlying = useMemo(() => {
    if (!showProjections || !autoOption || spotPrice <= 0 || !autoOption.delta || stopLossPercent <= 0) return undefined;
    const entryPrice = autoOption.askPrice;
    const optionStopLoss = entryPrice * (1 - stopLossPercent);
    const optionDrop = entryPrice - optionStopLoss;
    const underlyingMove = Math.abs(optionDrop / autoOption.delta);
    // For calls, SL is below spot; for puts, SL is above spot
    return autoOption.type === "C"
      ? spotPrice - underlyingMove
      : spotPrice + underlyingMove;
  }, [showProjections, autoOption, spotPrice, stopLossPercent]);

  const trailStartUnderlying = useMemo(() => {
    if (!showProjections || !autoOption || spotPrice <= 0 || !autoOption.delta || trailingStartPercent <= 0) return undefined;
    const entryPrice = autoOption.askPrice;
    const trailStartMove = (entryPrice * trailingStartPercent) / Math.abs(autoOption.delta);
    // For calls, trail start is above spot; for puts, below spot
    return autoOption.type === "C"
      ? spotPrice + trailStartMove
      : spotPrice - trailStartMove;
  }, [showProjections, autoOption, spotPrice, trailingStartPercent]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Options Trading</h1>
        <SymbolSearch />
      </header>

      <main className="app-main">
        <div className="left-column">
          <Chart
            pnlProjections={pnlProjections}
            stopLossUnderlying={stopLossUnderlying}
            trailStartUnderlying={trailStartUnderlying}
          />
          <OptionsChain
            onSelectContract={handleSelectContract}
            onAutoSelect={handleAutoSelect}
            onChainReady={handleChainReady}
          />
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
