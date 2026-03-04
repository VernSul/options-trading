import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type IPriceLine,
  type Time,
  ColorType,
  LineStyle,
} from "lightweight-charts";
import { useMarketStore } from "../../stores/useMarketStore";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { rest } from "../../api/rest";
import { normalizeBars } from "../../utils/normalize";
import type { Bar } from "../../types";
import type { Timeframe } from "../../stores/useSettingsStore";

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "1m", value: "1Min" },
  { label: "5m", value: "5Min" },
  { label: "15m", value: "15Min" },
  { label: "1H", value: "1H" },
  { label: "1D", value: "1D" },
];

function barToCandle(bar: Bar): CandlestickData<Time> {
  return {
    time: (new Date(bar.timestamp).getTime() / 1000) as Time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

interface PnLProjection {
  price: number;
  pl: number;
  plPercent: number;
}

interface ChartProps {
  pnlProjections?: PnLProjection[];
  stopLossUnderlying?: number;
  trailStartUnderlying?: number;
}

export function Chart({ pnlProjections, stopLossUnderlying, trailStartUnderlying }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const pnlLinesRef = useRef<IPriceLine[]>([]);
  const riskLinesRef = useRef<IPriceLine[]>([]);
  const liveCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  // Track what's currently loaded on the chart to detect full-load vs live-update
  const loadedKeyRef = useRef("");    // "SYMBOL:TIMEFRAME" of loaded data
  const loadedCountRef = useRef(0);   // number of bars loaded on chart

  const { currentSymbol, bars, latestQuote, isStale } = useMarketStore();
  const { defaultTimeframe, setDefaultTimeframe } = useSettingsStore();
  const timeframe = defaultTimeframe;
  const setTimeframe = setDefaultTimeframe;

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1a1a2e" },
        textColor: "#e0e0e0",
      },
      grid: {
        vertLines: { color: "#2a2a4a" },
        horzLines: { color: "#2a2a4a" },
      },
      crosshair: {
        vertLine: { color: "#6366f1" },
        horzLine: { color: "#6366f1" },
      },
      timeScale: {
        borderColor: "#2a2a4a",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#2a2a4a",
        autoScale: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Fetch bars and load chart on symbol/timeframe change.
  // Uses an abort controller so rapid switching cancels stale fetches.
  useEffect(() => {
    if (!currentSymbol) return;

    const series = seriesRef.current;
    const chart = chartRef.current;

    // Clear chart immediately
    liveCandleRef.current = null;
    loadedKeyRef.current = "";
    loadedCountRef.current = 0;
    if (series) series.setData([]);

    const abortCtrl = new AbortController();

    rest
      .getBars(currentSymbol, timeframe)
      .then((data) => {
        if (abortCtrl.signal.aborted) return;
        if (!data || !Array.isArray(data) || data.length === 0) return;

        const normalized = normalizeBars(data);
        const candles = normalized.map(barToCandle);

        if (series) {
          series.setData(candles);
          chart?.timeScale().fitContent();
        }

        // Store bars in Zustand (for header price display and live candle logic)
        useMarketStore.getState().setBars(normalized);
        loadedKeyRef.current = `${currentSymbol}:${timeframe}`;
        loadedCountRef.current = normalized.length;
      })
      .catch((err) => {
        if (abortCtrl.signal.aborted) return;
        console.error(`Failed to load bars for ${currentSymbol}:`, err);
      });

    return () => {
      abortCtrl.abort();
    };
  }, [currentSymbol, timeframe]);

  // Sync chart when bars change from live updates (addBar from WS or quote engine).
  // Only runs for incremental updates — full loads are handled above.
  const syncBars = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;

    const currentBars = useMarketStore.getState().bars;
    const currentKey = `${currentSymbol}:${timeframe}`;

    // Skip if this isn't the currently loaded dataset
    if (loadedKeyRef.current !== currentKey) return;
    // Skip if bars count hasn't changed (no new bar added)
    if (currentBars.length <= loadedCountRef.current) {
      // Same count — might be an in-place update of the last bar
      if (currentBars.length > 0 && currentBars.length === loadedCountRef.current) {
        const lastBar = currentBars[currentBars.length - 1];
        series.update(barToCandle(lastBar));
      }
      return;
    }

    // New bar added — update chart and count
    const lastBar = currentBars[currentBars.length - 1];
    series.update(barToCandle(lastBar));
    loadedCountRef.current = currentBars.length;
  }, [currentSymbol, timeframe]);

  // Subscribe to bar changes in the store
  useEffect(() => {
    return useMarketStore.subscribe(syncBars);
  }, [syncBars]);

  // Live price update from quotes — build candles from mid-price
  useEffect(() => {
    if (!seriesRef.current || !latestQuote) return;

    const storeSymbol = useMarketStore.getState().currentSymbol;
    if (latestQuote.symbol !== storeSymbol) return;

    const storeBars = useMarketStore.getState().bars;
    if (storeBars.length === 0) return;

    const mid = (latestQuote.bidPrice + latestQuote.askPrice) / 2;
    if (mid <= 0) return;

    const quoteTime = new Date(latestQuote.timestamp).getTime();
    if (isNaN(quoteTime)) return;

    const tfMs: Record<string, number> = {
      "1Min": 60_000, "5Min": 300_000, "15Min": 900_000,
      "1H": 3_600_000, "1D": 86_400_000,
    };
    const bucketMs = tfMs[timeframe] || 60_000;
    const bucketStart = Math.floor(quoteTime / bucketMs) * bucketMs;
    const bucketISO = new Date(bucketStart).toISOString();

    const lc = liveCandleRef.current;

    if (lc && bucketStart > lc.time) {
      // New candle period — start fresh
      liveCandleRef.current = { time: bucketStart, open: mid, high: mid, low: mid, close: mid };
      useMarketStore.getState().addBar({
        symbol: storeSymbol,
        timestamp: bucketISO,
        open: mid, high: mid, low: mid, close: mid,
        volume: 0, tradeCount: 0, vwap: 0,
      });
    } else if (lc && bucketStart === lc.time) {
      // Same candle period — update OHLC
      lc.high = Math.max(lc.high, mid);
      lc.low = Math.min(lc.low, mid);
      lc.close = mid;
      seriesRef.current!.update({
        time: (bucketStart / 1000) as Time,
        open: lc.open, high: lc.high, low: lc.low, close: mid,
      });
    } else {
      // No live candle yet — determine if we need a new one or update last bar
      const lastBar = storeBars[storeBars.length - 1];
      const lastBarBucket = Math.floor(new Date(lastBar.timestamp).getTime() / bucketMs) * bucketMs;

      if (bucketStart > lastBarBucket) {
        // New period beyond last historical bar
        liveCandleRef.current = { time: bucketStart, open: mid, high: mid, low: mid, close: mid };
        useMarketStore.getState().addBar({
          symbol: storeSymbol,
          timestamp: bucketISO,
          open: mid, high: mid, low: mid, close: mid,
          volume: 0, tradeCount: 0, vwap: 0,
        });
      } else {
        // Same period as last bar — update it visually + start tracking
        liveCandleRef.current = {
          time: lastBarBucket,
          open: lastBar.open,
          high: Math.max(lastBar.high, mid),
          low: Math.min(lastBar.low, mid),
          close: mid,
        };
        seriesRef.current!.update({
          time: (lastBarBucket / 1000) as Time,
          open: lastBar.open,
          high: liveCandleRef.current.high,
          low: liveCandleRef.current.low,
          close: mid,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQuote]);

  // Polling fallback: fetch REST quote every 5s if no live quote is arriving
  useEffect(() => {
    if (!currentSymbol) return;

    const timer = setInterval(async () => {
      const quote = useMarketStore.getState().latestQuote;
      const quoteAge = quote ? Date.now() - new Date(quote.timestamp).getTime() : Infinity;
      // Only poll if quote is stale (>5s old) or missing
      if (quoteAge < 5000) return;

      try {
        const data = await rest.getQuote(currentSymbol);
        if (!data || !data.bp || !data.ap) return;
        // Only update if still the same symbol
        if (useMarketStore.getState().currentSymbol !== currentSymbol) return;
        useMarketStore.getState().setLatestQuote({
          symbol: currentSymbol,
          bidPrice: data.bp,
          askPrice: data.ap,
          bidSize: data.bs ?? 0,
          askSize: data.as ?? 0,
          timestamp: data.t || new Date().toISOString(),
        });
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [currentSymbol]);

  // P&L projection lines
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of pnlLinesRef.current) {
      series.removePriceLine(line);
    }
    pnlLinesRef.current = [];

    if (!pnlProjections || pnlProjections.length === 0) return;

    for (const proj of pnlProjections) {
      const isPositive = proj.pl >= 0;
      const sign = isPositive ? "+" : "";
      const line = series.createPriceLine({
        price: proj.price,
        color: isPositive ? "#22c55e" : "#ef4444",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `${sign}$${proj.pl.toFixed(0)} (${sign}${proj.plPercent.toFixed(1)}%)`,
      });
      pnlLinesRef.current.push(line);
    }
  }, [pnlProjections]);

  // Stop-loss & trailing start lines
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of riskLinesRef.current) {
      series.removePriceLine(line);
    }
    riskLinesRef.current = [];

    if (stopLossUnderlying && stopLossUnderlying > 0) {
      const slLine = series.createPriceLine({
        price: stopLossUnderlying,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "SL",
      });
      riskLinesRef.current.push(slLine);
    }

    if (trailStartUnderlying && trailStartUnderlying > 0) {
      const trailLine = series.createPriceLine({
        price: trailStartUnderlying,
        color: "#eab308",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Trail Start",
      });
      riskLinesRef.current.push(trailLine);
    }
  }, [stopLossUnderlying, trailStartUnderlying]);

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span className="chart-symbol">{currentSymbol}</span>
        <span className="chart-price">
          {latestQuote
            ? ((latestQuote.bidPrice + latestQuote.askPrice) / 2).toFixed(2)
            : bars.length > 0
              ? bars[bars.length - 1].close.toFixed(2)
              : "—"}
        </span>
        {isStale && (
          <span style={{
            background: "#ef4444",
            color: "#fff",
            fontSize: "0.65rem",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "3px",
            marginLeft: "8px",
            letterSpacing: "0.05em",
          }}>
            STALE
          </span>
        )}
        <div className="timeframe-buttons">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              className={`btn btn-small ${timeframe === tf.value ? "btn-active" : ""}`}
              onClick={() => setTimeframe(tf.value)}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="chart-canvas" />
    </div>
  );
}
