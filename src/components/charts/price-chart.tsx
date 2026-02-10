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

interface ChartPrefs {
  range: TimeRange;
  type: ChartType;
  show50SMA: boolean;
  show200SMA: boolean;
  showEMA12: boolean;
  showEMA26: boolean;
  showBB: boolean;
}

function loadChartPrefs(key: string | undefined): ChartPrefs {
  const defaults: ChartPrefs = { range: "3M", type: "candle", show50SMA: false, show200SMA: false, showEMA12: false, showEMA26: false, showBB: false };
  if (!key || typeof window === "undefined") return defaults;
  try {
    const stored = localStorage.getItem(`chart_prefs_${key}`);
    if (stored) {
      const prefs = JSON.parse(stored);
      return {
        range: prefs.range || "3M",
        type: prefs.type || "candle",
        show50SMA: prefs.show50SMA ?? false,
        show200SMA: prefs.show200SMA ?? false,
        showEMA12: prefs.showEMA12 ?? false,
        showEMA26: prefs.showEMA26 ?? false,
        showBB: prefs.showBB ?? false,
      };
    }
  } catch {
    // Ignore errors
  }
  return defaults;
}

function saveChartPrefs(key: string | undefined, prefs: ChartPrefs) {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(`chart_prefs_${key}`, JSON.stringify(prefs));
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
  sma50?: number;
  sma200?: number;
  ema12?: number;
  ema26?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
}

function computeSMA(data: { time: Time; close: number }[], period: number): LineData<Time>[] {
  const result: LineData<Time>[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].close;
    if (i >= period) {
      sum -= data[i - period].close;
    }
    if (i >= period - 1) {
      result.push({ time: data[i].time, value: sum / period });
    }
  }
  return result;
}

function computeEMA(data: { time: Time; close: number }[], period: number): LineData<Time>[] {
  if (data.length < period) return [];
  const result: LineData<Time>[] = [];
  const k = 2 / (period + 1);
  // Seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

function computeBollingerBands(data: { time: Time; close: number }[], period = 20, mult = 2): { upper: LineData<Time>[]; middle: LineData<Time>[]; lower: LineData<Time>[] } {
  const upper: LineData<Time>[] = [];
  const middle: LineData<Time>[] = [];
  const lower: LineData<Time>[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const mean = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (data[j].close - mean) ** 2;
    const stddev = Math.sqrt(sqSum / period);
    middle.push({ time: data[i].time, value: mean });
    upper.push({ time: data[i].time, value: mean + mult * stddev });
    lower.push({ time: data[i].time, value: mean - mult * stddev });
  }
  return { upper, middle, lower };
}

export function PriceChart({ symbol, height = 300, storageKey, timeframeChanges }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const initialPrefs = useRef(loadChartPrefs(storageKey));
  const [activeRange, setActiveRange] = useState<TimeRange>(initialPrefs.current.range);
  const [chartType, setChartType] = useState<ChartType>(initialPrefs.current.type);
  const [show50SMA, setShow50SMA] = useState(initialPrefs.current.show50SMA);
  const [show200SMA, setShow200SMA] = useState(initialPrefs.current.show200SMA);
  const [showEMA12, setShowEMA12] = useState(initialPrefs.current.showEMA12);
  const [showEMA26, setShowEMA26] = useState(initialPrefs.current.showEMA26);
  const [showBB, setShowBB] = useState(initialPrefs.current.showBB);
  const [data, setData] = useState<StockTimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [legendData, setLegendData] = useState<LegendData | null>(null);

  // Save preferences when they change
  useEffect(() => {
    saveChartPrefs(storageKey, { range: activeRange, type: chartType, show50SMA, show200SMA, showEMA12, showEMA26, showBB });
  }, [storageKey, activeRange, chartType, show50SMA, show200SMA, showEMA12, showEMA26, showBB]);

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
    } catch {
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

    // Add indicator series (only on daily+ timeframes)
    const sma50DataMap = new Map<string | number, number>();
    const sma200DataMap = new Map<string | number, number>();
    const ema12DataMap = new Map<string | number, number>();
    const ema26DataMap = new Map<string | number, number>();
    const bbUpperDataMap = new Map<string | number, number>();
    const bbMiddleDataMap = new Map<string | number, number>();
    const bbLowerDataMap = new Map<string | number, number>();

    if (!isIntraday) {
      if (show50SMA) {
        const sma50Data = computeSMA(finalData, 50);
        const sma50Series = chart.addSeries(LineSeries, {
          color: "#f59e0b",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        sma50Series.setData(sma50Data);
        sma50Data.forEach((d) => sma50DataMap.set(d.time as string | number, d.value));
      }
      if (show200SMA) {
        const sma200Data = computeSMA(finalData, 200);
        const sma200Series = chart.addSeries(LineSeries, {
          color: "#a855f7",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        sma200Series.setData(sma200Data);
        sma200Data.forEach((d) => sma200DataMap.set(d.time as string | number, d.value));
      }
      if (showEMA12) {
        const ema12Data = computeEMA(finalData, 12);
        const ema12Series = chart.addSeries(LineSeries, {
          color: "#06b6d4",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        ema12Series.setData(ema12Data);
        ema12Data.forEach((d) => ema12DataMap.set(d.time as string | number, d.value));
      }
      if (showEMA26) {
        const ema26Data = computeEMA(finalData, 26);
        const ema26Series = chart.addSeries(LineSeries, {
          color: "#ec4899",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        ema26Series.setData(ema26Data);
        ema26Data.forEach((d) => ema26DataMap.set(d.time as string | number, d.value));
      }
      if (showBB) {
        const bb = computeBollingerBands(finalData);
        const bbUpperSeries = chart.addSeries(LineSeries, {
          color: "rgba(99, 102, 241, 0.4)",
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        bbUpperSeries.setData(bb.upper);
        bb.upper.forEach((d) => bbUpperDataMap.set(d.time as string | number, d.value));
        const bbMiddleSeries = chart.addSeries(LineSeries, {
          color: "rgba(99, 102, 241, 0.8)",
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        bbMiddleSeries.setData(bb.middle);
        bb.middle.forEach((d) => bbMiddleDataMap.set(d.time as string | number, d.value));
        const bbLowerSeries = chart.addSeries(LineSeries, {
          color: "rgba(99, 102, 241, 0.4)",
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        bbLowerSeries.setData(bb.lower);
        bb.lower.forEach((d) => bbLowerDataMap.set(d.time as string | number, d.value));
      }
    }

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

    // Helper to build legend with optional indicator values
    const buildLegend = (bar: typeof finalData[0], volume: number, time: Time): LegendData => ({
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume,
      time: formatLegendTime(time, isIntraday),
      sma50: sma50DataMap.get(time as string | number),
      sma200: sma200DataMap.get(time as string | number),
      ema12: ema12DataMap.get(time as string | number),
      ema26: ema26DataMap.get(time as string | number),
      bbUpper: bbUpperDataMap.get(time as string | number),
      bbMiddle: bbMiddleDataMap.get(time as string | number),
      bbLower: bbLowerDataMap.get(time as string | number),
    });

    // Set initial legend to last bar
    const lastBar = finalData[finalData.length - 1];
    const lastOriginalData = data[lastBar.originalIndex];
    setLegendData(buildLegend(lastBar, lastOriginalData?.volume ?? 0, lastBar.time));

    // Subscribe to crosshair move for legend updates
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        // Cursor left chart - show last bar
        setLegendData(buildLegend(lastBar, lastOriginalData?.volume ?? 0, lastBar.time));
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
            sma50: sma50DataMap.get(param.time as string | number),
            sma200: sma200DataMap.get(param.time as string | number),
            ema12: ema12DataMap.get(param.time as string | number),
            ema26: ema26DataMap.get(param.time as string | number),
            bbUpper: bbUpperDataMap.get(param.time as string | number),
            bbMiddle: bbMiddleDataMap.get(param.time as string | number),
            bbLower: bbLowerDataMap.get(param.time as string | number),
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
  }, [data, height, activeRange, chartType, show50SMA, show200SMA, showEMA12, showEMA26, showBB]);

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
          {/* MA Toggle Buttons - only on daily+ timeframes */}
          {activeRange !== "1D" && activeRange !== "5D" && (
            <div className="flex gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
              <button
                onClick={() => setShow50SMA((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  show50SMA
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
                }`}
              >
                MA50
              </button>
              <button
                onClick={() => setShow200SMA((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  show200SMA
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
                }`}
              >
                MA200
              </button>
              <button
                onClick={() => setShowEMA12((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  showEMA12
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
                }`}
              >
                EMA12
              </button>
              <button
                onClick={() => setShowEMA26((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  showEMA26
                    ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
                }`}
              >
                EMA26
              </button>
              <button
                onClick={() => setShowBB((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  showBB
                    ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                    : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10"
                }`}
              >
                BB
              </button>
            </div>
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
                  {show50SMA && legendData.sma50 !== undefined && (
                    <span className="text-black/50 dark:text-white/50">
                      MA50: <span className="text-amber-500">{legendData.sma50.toFixed(2)}</span>
                    </span>
                  )}
                  {show200SMA && legendData.sma200 !== undefined && (
                    <span className="text-black/50 dark:text-white/50">
                      MA200: <span className="text-purple-500">{legendData.sma200.toFixed(2)}</span>
                    </span>
                  )}
                  {showEMA12 && legendData.ema12 !== undefined && (
                    <span className="text-black/50 dark:text-white/50">
                      EMA12: <span className="text-cyan-500">{legendData.ema12.toFixed(2)}</span>
                    </span>
                  )}
                  {showEMA26 && legendData.ema26 !== undefined && (
                    <span className="text-black/50 dark:text-white/50">
                      EMA26: <span className="text-pink-500">{legendData.ema26.toFixed(2)}</span>
                    </span>
                  )}
                  {showBB && legendData.bbUpper !== undefined && legendData.bbMiddle !== undefined && legendData.bbLower !== undefined && (
                    <span className="text-black/50 dark:text-white/50">
                      BB: <span className="text-indigo-400">{legendData.bbUpper.toFixed(2)} / {legendData.bbMiddle.toFixed(2)} / {legendData.bbLower.toFixed(2)}</span>
                    </span>
                  )}
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
