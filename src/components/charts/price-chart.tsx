"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  LineData,
  CandlestickData,
  Time,
  LineSeries,
  CandlestickSeries,
} from "lightweight-charts";
import { StockTimeSeries } from "@/types";
import { Button } from "@/components/ui/button";

type TimeRange = "1D" | "5D" | "3M" | "1Y";
type ChartType = "line" | "candle";

interface PriceChartProps {
  symbol: string;
  height?: number;
  storageKey?: string; // Key for persisting chart preferences (e.g., "watchlist_1")
}

// Map time range to API parameters - daily ranges all fetch 1Y for zoom flexibility
const rangeConfig: Record<TimeRange, { period: string; interval: string }> = {
  "1D": { period: "1d", interval: "5m" },
  "5D": { period: "5d", interval: "1h" },  // Hourly candles
  "3M": { period: "1y", interval: "1d" },  // Fetch 1Y but show 3M
  "1Y": { period: "1y", interval: "1d" },
};

function loadChartPrefs(key: string | undefined): { range: TimeRange; type: ChartType } {
  if (!key || typeof window === "undefined") return { range: "3M", type: "line" };
  try {
    const stored = localStorage.getItem(`chart_prefs_${key}`);
    if (stored) {
      const prefs = JSON.parse(stored);
      return {
        range: prefs.range || "3M",
        type: prefs.type || "line",
      };
    }
  } catch {
    // Ignore errors
  }
  return { range: "3M", type: "line" };
}

function saveChartPrefs(key: string | undefined, range: TimeRange, type: ChartType) {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(`chart_prefs_${key}`, JSON.stringify({ range, type }));
  } catch {
    // Ignore errors
  }
}

export function PriceChart({ symbol, height = 300, storageKey }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const initialPrefs = useRef(loadChartPrefs(storageKey));
  const [activeRange, setActiveRange] = useState<TimeRange>(initialPrefs.current.range);
  const [chartType, setChartType] = useState<ChartType>(initialPrefs.current.type);
  const [data, setData] = useState<StockTimeSeries[]>([]);
  const [loading, setLoading] = useState(true);

  // Save preferences when they change
  useEffect(() => {
    saveChartPrefs(storageKey, activeRange, chartType);
  }, [storageKey, activeRange, chartType]);

  const fetchData = useCallback(async (range: TimeRange) => {
    setLoading(true);
    const config = rangeConfig[range];
    try {
      const response = await fetch(
        `/api/stocks/${symbol}?timeseries=true&period=${config.period}&interval=${config.interval}`
      );
      if (response.ok) {
        const result = await response.json();
        setData(result.timeSeries || []);
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  // Fetch data when range or symbol changes
  useEffect(() => {
    fetchData(activeRange);
  }, [activeRange, fetchData]);

  // Render chart when data changes
  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#374151" },
        horzLines: { color: "#374151" },
      },
      width: chartContainerRef.current.clientWidth,
      height,
      timeScale: {
        borderColor: "#374151",
        timeVisible: activeRange === "1D" || activeRange === "5D",
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
    });

    chartRef.current = chart;

    const isIntraday = activeRange === "1D" || activeRange === "5D";

    // Process data for the chart
    const processedData = data
      .map((d) => ({
        time: (isIntraday
          ? Math.floor(new Date(d.date).getTime() / 1000)
          : d.date.split("T")[0]) as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      .sort((a, b) => {
        if (typeof a.time === "number" && typeof b.time === "number") {
          return a.time - b.time;
        }
        return (a.time as string).localeCompare(b.time as string);
      });

    // For daily data, deduplicate by date (keep last value for each date)
    let finalData = processedData;
    if (!isIntraday) {
      const seen = new Map<string, typeof processedData[0]>();
      processedData.forEach((d) => seen.set(d.time as string, d));
      finalData = Array.from(seen.values());
    }

    if (chartType === "candle") {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      const candleData: CandlestickData<Time>[] = finalData.map((d) => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      candleSeries.setData(candleData);
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
      });
      const lineData: LineData<Time>[] = finalData.map((d) => ({
        time: d.time,
        value: d.close,
      }));
      lineSeries.setData(lineData);
    }

    // Set visible range based on selected time range
    if (activeRange === "3M" && finalData.length > 0) {
      const now = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      chart.timeScale().setVisibleRange({
        from: threeMonthsAgo.toISOString().split("T")[0] as Time,
        to: now.toISOString().split("T")[0] as Time,
      });
    } else {
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data, height, activeRange, chartType]);

  const handleRangeChange = (range: TimeRange) => {
    setActiveRange(range);
  };

  const ranges: TimeRange[] = ["1Y", "3M", "5D", "1D"];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-between items-center">
        {/* Time Range Buttons */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
          {ranges.map((range) => (
            <button
              key={range}
              onClick={() => handleRangeChange(range)}
              disabled={loading}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeRange === range
                  ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Chart Type Toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setChartType("line")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
              chartType === "line"
                ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
            </svg>
            Line
          </button>
          <button
            onClick={() => setChartType("candle")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
              chartType === "candle"
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Candle
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div className="rounded-xl bg-white/[0.02] border border-white/10 p-4 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[300px] gap-3">
            <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-white/50 text-sm">Loading chart data...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
              <svg className="w-6 h-6 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-white/50 text-sm">No price data available</span>
          </div>
        ) : (
          <div ref={chartContainerRef} />
        )}
      </div>
    </div>
  );
}
