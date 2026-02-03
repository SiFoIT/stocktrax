"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, LineData, Time, LineSeries } from "lightweight-charts";
import { StockTimeSeries } from "@/types";

interface PriceChartProps {
  data: StockTimeSeries[];
  height?: number;
}

export function PriceChart({ data, height = 300 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

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
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
    });

    chartRef.current = chart;

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
    });

    const chartData: LineData<Time>[] = data
      .map((d) => ({
        time: d.date as Time,
        value: d.close,
      }))
      .sort((a, b) => (a.time as string).localeCompare(b.time as string));

    lineSeries.setData(chartData);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No price data available
      </div>
    );
  }

  return <div ref={chartContainerRef} />;
}
