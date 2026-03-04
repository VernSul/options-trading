import { useEffect, useRef } from "react";
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
  const shouldFitRef = useRef(true);
  const pnlLinesRef = useRef<IPriceLine[]>([]);
  const riskLinesRef = useRef<IPriceLine[]>([]);
  const liveCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const { currentSymbol, bars, setBars, latestQuote } = useMarketStore();
  const { defaultTimeframe, setDefaultTimeframe } = useSettingsStore();
  const timeframe = defaultTimeframe;
  const setTimeframe = setDefaultTimeframe;

  // Create chart
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

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Load bars on symbol or timeframe change
  useEffect(() => {
    if (!currentSymbol) return;
    shouldFitRef.current = true;
    liveCandleRef.current = null;
    rest.getBars(currentSymbol, timeframe).then((data) => {
      if (data) setBars(normalizeBars(data));
    });
  }, [currentSymbol, timeframe, setBars]);

  // Live price update from quotes — build candles from trade stream
  const { addBar } = useMarketStore();
  useEffect(() => {
    if (!seriesRef.current || !latestQuote || bars.length === 0) return;
    const mid = (latestQuote.bidPrice + latestQuote.askPrice) / 2;
    if (mid <= 0) return;

    const quoteTime = new Date(latestQuote.timestamp).getTime();
    if (isNaN(quoteTime)) return;

    // Timeframe duration in ms
    const tfMs: Record<string, number> = {
      "1Min": 60_000, "5Min": 300_000, "15Min": 900_000,
      "1H": 3_600_000, "1D": 86_400_000,
    };
    const bucketMs = tfMs[timeframe] || 60_000;
    const bucketStart = Math.floor(quoteTime / bucketMs) * bucketMs;
    const bucketISO = new Date(bucketStart).toISOString();

    const lc = liveCandleRef.current;

    if (lc && bucketStart > lc.time) {
      // New candle period — commit previous live candle to bars, start fresh
      liveCandleRef.current = { time: bucketStart, open: mid, high: mid, low: mid, close: mid };
      addBar({
        symbol: currentSymbol,
        timestamp: bucketISO,
        open: mid, high: mid, low: mid, close: mid,
        volume: 0, tradeCount: 0, vwap: 0,
      });
    } else if (lc && bucketStart === lc.time) {
      // Same candle period — update OHLC
      lc.high = Math.max(lc.high, mid);
      lc.low = Math.min(lc.low, mid);
      lc.close = mid;
      // Update chart directly (addBar would cause re-render loop)
      seriesRef.current.update({
        time: (bucketStart / 1000) as Time,
        open: lc.open, high: lc.high, low: lc.low, close: mid,
      });
    } else {
      // No live candle yet — determine if we need a new one or update last bar
      const lastBar = bars[bars.length - 1];
      const lastBarBucket = Math.floor(new Date(lastBar.timestamp).getTime() / bucketMs) * bucketMs;

      if (bucketStart > lastBarBucket) {
        // New period beyond last historical bar
        liveCandleRef.current = { time: bucketStart, open: mid, high: mid, low: mid, close: mid };
        addBar({
          symbol: currentSymbol,
          timestamp: bucketISO,
          open: mid, high: mid, low: mid, close: mid,
          volume: 0, tradeCount: 0, vwap: 0,
        });
      } else {
        // Same period as last bar — update it visually
        seriesRef.current.update({
          time: (lastBarBucket / 1000) as Time,
          open: lastBar.open,
          high: Math.max(lastBar.high, mid),
          low: Math.min(lastBar.low, mid),
          close: mid,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQuote]);

  // Track previous bars length to distinguish full load from live updates
  const prevBarsLenRef = useRef(0);

  // Update chart data
  useEffect(() => {
    if (!seriesRef.current || bars.length === 0) return;

    const prevLen = prevBarsLenRef.current;
    prevBarsLenRef.current = bars.length;

    // Full load (symbol/timeframe change) or first load
    if (shouldFitRef.current || prevLen === 0) {
      const candles = bars.map(barToCandle);
      seriesRef.current.setData(candles);
      if (shouldFitRef.current) {
        chartRef.current?.timeScale().fitContent();
        shouldFitRef.current = false;
      }
    } else {
      // Live update — just update the last candle
      const lastBar = bars[bars.length - 1];
      seriesRef.current.update(barToCandle(lastBar));
    }
  }, [bars]);

  // P&L projection lines
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Clear old lines
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

    // Clear old lines
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
      <div ref={containerRef} style={{ width: "100%", height: "400px" }} />
    </div>
  );
}
