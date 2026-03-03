import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  ColorType,
} from "lightweight-charts";
import { useMarketStore } from "../../stores/useMarketStore";
import { rest } from "../../api/rest";
import { normalizeBars } from "../../utils/normalize";
import type { Bar } from "../../types";

function barToCandle(bar: Bar): CandlestickData<Time> {
  return {
    time: (new Date(bar.timestamp).getTime() / 1000) as Time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

export function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const { currentSymbol, bars, setBars } = useMarketStore();

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
      rightPriceScale: { borderColor: "#2a2a4a" },
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

  // Load bars on symbol change
  useEffect(() => {
    if (!currentSymbol) return;
    rest.getBars(currentSymbol, "5Min").then((data) => {
      if (data) setBars(normalizeBars(data));
    });
  }, [currentSymbol, setBars]);

  // Update chart data
  useEffect(() => {
    if (!seriesRef.current || bars.length === 0) return;
    const candles = bars.map(barToCandle);
    seriesRef.current.setData(candles);
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  // Real-time bar updates
  useEffect(() => {
    if (!seriesRef.current || bars.length === 0) return;
    const last = bars[bars.length - 1];
    if (last) {
      seriesRef.current.update(barToCandle(last));
    }
  }, [bars]);

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span className="chart-symbol">{currentSymbol}</span>
        {bars.length > 0 && (
          <span className="chart-price">
            {bars[bars.length - 1].close.toFixed(2)}
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ width: "100%", height: "400px" }} />
    </div>
  );
}
