"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  LineData,
  CandlestickData,
  HistogramData,
  Time,
  LineSeries,
  CandlestickSeries,
  HistogramSeries,
  SeriesType,
} from "lightweight-charts";
import { StockTimeSeries } from "@/types";
import { toEasternTime, formatVolume } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type TimeRange = "1D" | "5D" | "3M" | "1Y" | "5Y";
type ChartType = "line" | "candle";

interface TimeframeChanges {
  "1D"?: number;
  "5D"?: number;
  "3M"?: number;
  "1Y"?: number;
  "5Y"?: number;
}

interface PriceChartProps {
  symbol: string;
  height?: number;
  storageKey?: string; // Key for persisting chart preferences (e.g., "watchlist_1")
  timeframeChanges?: TimeframeChanges; // Percentage changes for each timeframe
}

// Map time range to API parameters - fetch extra data for zoom/scroll flexibility
const rangeConfig: Record<TimeRange, { period: string; interval: string; showDays: number }> = {
  "1D": { period: "5d", interval: "5m", showDays: 1 },      // Fetch 5 days, show 1 day
  "5D": { period: "1mo", interval: "15m", showDays: 5 },    // Fetch 1 month, show 5 days
  "3M": { period: "2y", interval: "1d", showDays: 90 },     // Fetch 2 years, show 3 months
  "1Y": { period: "3y", interval: "1d", showDays: 365 },    // Fetch 3 years, show 1 year
  "5Y": { period: "10y", interval: "1wk", showDays: 1825 }, // Fetch 10 years, show 5 years
};

function loadChartPrefs(key: string | undefined): { range: TimeRange; type: ChartType } {
  if (!key || typeof window === "undefined") return { range: "3M", type: "candle" };
  try {
    const stored = localStorage.getItem(`chart_prefs_${key}`);
    if (stored) {
      const prefs = JSON.parse(stored);
      return {
        range: prefs.range || "3M",
        type: prefs.type || "candle",
      };
    }
  } catch {
    // Ignore errors
  }
  return { range: "3M", type: "candle" };
}

function saveChartPrefs(key: string | undefined, range: TimeRange, type: ChartType) {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(`chart_prefs_${key}`, JSON.stringify({ range, type }));
  } catch {
    // Ignore errors
  }
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getChangeColor(value: number | undefined): string {
  if (value === undefined) return "text-white/50";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function formatLegendTime(time: Time, isIntraday: boolean): string {
  if (isIntraday && typeof time === "number") {
    const date = new Date(time * 1000);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return time as string;
}

interface LegendData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: string;
}

export function PriceChart({ symbol, height = 300, storageKey, timeframeChanges }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const initialPrefs = useRef(loadChartPrefs(storageKey));
  const [activeRange, setActiveRange] = useState<TimeRange>(initialPrefs.current.range);
  const [chartType, setChartType] = useState<ChartType>(initialPrefs.current.type);
  const [data, setData] = useState<StockTimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [legendData, setLegendData] = useState<LegendData | null>(null);

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
      height: height + 80, // Extra height for volume pane
      timeScale: {
        borderColor: "#374151",
        timeVisible: activeRange === "1D" || activeRange === "5D",
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#374151",
        scaleMargins: {
          top: 0.05,
          bottom: 0.25, // Reserve space for volume
        },
      },
    });

    chartRef.current = chart;

    const isIntraday = activeRange === "1D" || activeRange === "5D";

    // Process data for the chart
    // For intraday, convert UTC timestamps to Eastern Time for display
    const processedData = data
      .map((d, idx) => {
        const utcTimestamp = Math.floor(new Date(d.date).getTime() / 1000);
        return {
          time: (isIntraday
            ? toEasternTime(utcTimestamp)
            : d.date.split("T")[0]) as Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          originalIndex: idx, // Keep reference to original data for volume lookup
        };
      })
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

    let priceSeries: ISeriesApi<SeriesType>;

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
      priceSeries = candleSeries;
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
      priceSeries = lineSeries;
    }

    // Add volume histogram series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "volume",
    });

    // Configure volume price scale
    chart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.85, // Volume bars at bottom 15% of chart
        bottom: 0,
      },
    });

    // Map volume data with colors based on price direction
    const volumeData: HistogramData<Time>[] = finalData.map((d, i) => {
      const prevClose = i > 0 ? finalData[i - 1].close : d.open;
      const isUp = d.close >= prevClose;
      const originalData = data[d.originalIndex];
      return {
        time: d.time,
        value: originalData?.volume ?? 0,
        color: isUp ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
      };
    });
    volumeSeries.setData(volumeData);

    // Create a map for fast lookup of bar data by time
    const barDataMap = new Map<string | number, { open: number; high: number; low: number; close: number; volume: number }>();
    finalData.forEach((d) => {
      const originalData = data[d.originalIndex];
      barDataMap.set(d.time as string | number, {
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: originalData?.volume ?? 0,
      });
    });

    // Set initial legend to last bar
    const lastBar = finalData[finalData.length - 1];
    const lastOriginalData = data[lastBar.originalIndex];
    setLegendData({
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      close: lastBar.close,
      volume: lastOriginalData?.volume ?? 0,
      time: formatLegendTime(lastBar.time, isIntraday),
    });

    // Subscribe to crosshair move for legend updates
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        // Cursor left chart - show last bar
        setLegendData({
          open: lastBar.open,
          high: lastBar.high,
          low: lastBar.low,
          close: lastBar.close,
          volume: lastOriginalData?.volume ?? 0,
          time: formatLegendTime(lastBar.time, isIntraday),
        });
        return;
      }

      // Get data at crosshair position
      const priceData = param.seriesData.get(priceSeries);
      if (priceData) {
        const barInfo = barDataMap.get(param.time as string | number);
        if (barInfo) {
          setLegendData({
            open: barInfo.open,
            high: barInfo.high,
            low: barInfo.low,
            close: barInfo.close,
            volume: barInfo.volume,
            time: formatLegendTime(param.time, isIntraday),
          });
        }
      }
    });

    // Set visible range based on selected time range
    if (finalData.length > 0) {
      const config = rangeConfig[activeRange];
      const lastDataPoint = finalData[finalData.length - 1];

      // Calculate the "from" point based on showDays from the last data point
      const showDaysMs = config.showDays * 24 * 60 * 60 * 1000;

      if (isIntraday) {
        // For intraday, use the actual data timestamps
        const toTime = lastDataPoint.time as number;
        const fromTime = toTime - (config.showDays * 24 * 60 * 60);
        chart.timeScale().setVisibleRange({
          from: fromTime as Time,
          to: toTime as Time,
        });
      } else {
        // For daily/weekly, calculate date strings
        const toDate = lastDataPoint.time as string;
        const fromDate = new Date(new Date(toDate).getTime() - showDaysMs);
        chart.timeScale().setVisibleRange({
          from: fromDate.toISOString().split("T")[0] as Time,
          to: toDate as Time,
        });
      }
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

  const ranges: TimeRange[] = ["1D", "5D", "3M", "1Y", "5Y"];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 justify-between items-center">
        {/* Time Range Buttons */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-1 rounded-xl bg-black/5 dark:bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            {ranges.map((range) => (
              <button
                key={range}
                onClick={() => handleRangeChange(range)}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeRange === range
                    ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {range}
              </button>
            ))}
          </div>
          {timeframeChanges?.[activeRange] !== undefined && (
            <span className={`text-sm font-semibold ${getChangeColor(timeframeChanges[activeRange])}`}>
              {formatPercent(timeframeChanges[activeRange])}
            </span>
          )}
        </div>

        {/* Chart Type Toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-black/5 dark:bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
          <button
            onClick={() => setChartType("line")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 ${
              chartType === "line"
                ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
                : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
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
                : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
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
      <div className="rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-white/10 p-4 overflow-hidden">
        <div className="relative" style={{ minHeight: height + 80 }}>
          {data.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-[300px] gap-3">
              <div className="w-12 h-12 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <svg className="w-6 h-6 text-black/30 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-black/50 dark:text-white/50 text-sm">No price data available</span>
            </div>
          ) : (
            <>
              {/* Loading overlay */}
              {loading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-[1px] rounded-xl">
                  <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
              {/* OHLCV Legend */}
              {legendData && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2 font-mono">
                  <span className="text-black/50 dark:text-white/50">{legendData.time}</span>
                  {chartType === "candle" ? (
                    <>
                      <span className="text-black/50 dark:text-white/50">
                        O: <span className="text-black dark:text-white">{legendData.open.toFixed(2)}</span>
                      </span>
                      <span className="text-black/50 dark:text-white/50">
                        H: <span className="text-black dark:text-white">{legendData.high.toFixed(2)}</span>
                      </span>
                      <span className="text-black/50 dark:text-white/50">
                        L: <span className="text-black dark:text-white">{legendData.low.toFixed(2)}</span>
                      </span>
                      <span className="text-black/50 dark:text-white/50">
                        C: <span className={legendData.close >= legendData.open ? "text-emerald-500" : "text-red-500"}>
                          {legendData.close.toFixed(2)}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="text-black/50 dark:text-white/50">
                      Close: <span className="text-black dark:text-white">{legendData.close.toFixed(2)}</span>
                    </span>
                  )}
                  <span className="text-black/50 dark:text-white/50">
                    Vol: <span className="text-black dark:text-white">{formatVolume(legendData.volume, 2)}</span>
                  </span>
                </div>
              )}
              <div ref={chartContainerRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
