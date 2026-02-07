"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PriceChart } from "@/components/charts/price-chart";
import { formatPercent, getChangeColor } from "@/lib/utils";

interface TimeframeChanges {
  "1D"?: number;
  "5D"?: number;
  "3M"?: number;
  "1Y"?: number;
  "5Y"?: number;
}

interface StockListItem {
  symbol: string;
  changePercent?: number;
}

interface PriceChartModalProps {
  symbols: StockListItem[];
  initialIndex: number;
  storageKey?: string;
  getTimeframeChanges?: (symbol: string) => TimeframeChanges | undefined;
  onClose: () => void;
}

const PANEL_STORAGE_KEY = "chart_modal_panel_expanded";

function loadPanelExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = localStorage.getItem(PANEL_STORAGE_KEY);
    if (val === null) return true; // default open
    return val === "true";
  } catch {
    return true;
  }
}

function savePanelExpanded(expanded: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, String(expanded));
  } catch {
    // ignore
  }
}

export function PriceChartModal({
  symbols,
  initialIndex,
  storageKey,
  getTimeframeChanges,
  onClose,
}: PriceChartModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [panelExpanded, setPanelExpanded] = useState(loadPanelExpanded);
  const listRef = useRef<HTMLDivElement>(null);

  const currentSymbol = symbols[currentIndex]?.symbol ?? "";

  const navigate = useCallback(
    (direction: 1 | -1) => {
      setCurrentIndex((prev) => {
        const next = prev + direction;
        if (next < 0) return symbols.length - 1;
        if (next >= symbols.length) return 0;
        return next;
      });
    },
    [symbols.length]
  );

  const jumpTo = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate(1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, navigate]);

  // Auto-scroll active item into view in stock list
  useEffect(() => {
    if (!panelExpanded || !listRef.current) return;
    const activeItem = listRef.current.querySelector("[data-active='true']");
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentIndex, panelExpanded]);

  // Persist panel state
  const togglePanel = () => {
    setPanelExpanded((prev) => {
      savePanelExpanded(!prev);
      return !prev;
    });
  };

  const timeframeChanges = getTimeframeChanges?.(currentSymbol);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="flex flex-row items-stretch gap-2 max-h-[90vh]">
        {/* Sidebar panel — outside the modal */}
        {panelExpanded && (
          <div
            className="w-[180px] shrink-0 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Collapse button */}
            <button
              onClick={togglePanel}
              className="w-full flex items-center justify-center h-9 text-white/40 hover:text-white/70 hover:bg-white/5 transition-all shrink-0 border-b border-white/10"
              title="Collapse stock list"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Stock list */}
            <div ref={listRef} className="flex-1 overflow-y-auto">
              {symbols.map((item, idx) => (
                <button
                  key={item.symbol}
                  data-active={idx === currentIndex ? "true" : undefined}
                  onClick={() => jumpTo(idx)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-sm transition-all ${
                    idx === currentIndex
                      ? "bg-blue-500/20 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span className="font-medium truncate">{item.symbol}</span>
                  {item.changePercent !== undefined && (
                    <span className={`text-xs font-mono ml-2 shrink-0 ${getChangeColor(item.changePercent)}`}>
                      {formatPercent(item.changePercent)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal — full width for chart */}
        <div
          className="relative bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl w-[95vw] max-w-6xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-gradient-to-r from-purple-500/10 to-transparent shrink-0">
            <div className="flex items-center gap-3">
              {/* Panel toggle (when collapsed) */}
              {!panelExpanded && (
                <button
                  onClick={togglePanel}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
                  title="Show stock list"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              {/* Left arrow */}
              <button
                onClick={() => navigate(-1)}
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
                title="Previous (Left Arrow)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {/* Symbol + position */}
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">{currentSymbol}</span>
                <span className="text-sm text-white/40">
                  {currentIndex + 1}/{symbols.length}
                </span>
              </div>
              {/* Right arrow */}
              <button
                onClick={() => navigate(1)}
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
                title="Next (Right Arrow)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
              title="Close (Escape)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chart area — full width */}
          <div className="flex-1 overflow-auto p-5">
            <PriceChart
              symbol={currentSymbol}
              height={400}
              storageKey={storageKey}
              timeframeChanges={timeframeChanges}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
