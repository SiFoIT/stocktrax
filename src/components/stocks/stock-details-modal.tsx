"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NewsArticle } from "@/types";
import { formatVolume, formatPercentRatio, formatRelativeTime } from "@/lib/utils";

interface StockDetails {
  symbol: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  currency?: string;
  quoteType?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  previousClose?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  avgVolume?: number;
  lastTradeTime?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekChange?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  marketCap?: number;
  enterpriseValue?: number;
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  priceToSales?: number;
  dividendRate?: number;
  dividendYield?: number;
  exDividendDate?: string;
  payoutRatio?: number;
  revenue?: number;
  revenuePerShare?: number;
  grossProfit?: number;
  ebitda?: number;
  netIncome?: number;
  eps?: number;
  forwardEps?: number;
  profitMargin?: number;
  operatingMargin?: number;
  returnOnAssets?: number;
  returnOnEquity?: number;
  totalCash?: number;
  totalDebt?: number;
  debtToEquity?: number;
  currentRatio?: number;
  bookValue?: number;
  sharesOutstanding?: number;
  floatShares?: number;
  sharesShort?: number;
  shortRatio?: number;
  shortPercentOfFloat?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  targetMeanPrice?: number;
  recommendationMean?: number;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number;
  beta?: number;
  earningsDate?: string;
  sector?: string;
  industry?: string;
  website?: string;
  description?: string;
}

interface StockDetailsModalProps {
  symbol: string;
  onClose: () => void;
}

function formatNumber(value: number | undefined, decimals = 2): string {
  if (value === undefined || value === null) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCurrency(value: number | undefined, currency = "USD"): string {
  if (value === undefined || value === null) return "-";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLargeNumber(value: number | undefined): string {
  if (value === undefined || value === null) return "-";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}


function formatTradeTime(isoString: string | undefined): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}


function formatPercentRaw(value: number | undefined): string {
  if (value === undefined || value === null) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getChangeColor(value: number | undefined): string {
  if (value === undefined || value === null) return "text-muted-foreground";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function getRecommendationColor(key: string | undefined): string {
  if (!key) return "bg-gray-500/20 text-gray-400";
  switch (key.toLowerCase()) {
    case "strong_buy":
    case "strongbuy":
      return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    case "buy":
      return "bg-green-500/20 text-green-400 border border-green-500/30";
    case "hold":
      return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
    case "sell":
      return "bg-orange-500/20 text-orange-400 border border-orange-500/30";
    case "strong_sell":
    case "strongsell":
      return "bg-red-500/20 text-red-400 border border-red-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
  }
}

function getRatioColor(value: number | undefined, lowThreshold: number, highThreshold: number, inverse = false): string {
  if (value === undefined || value === null) return "text-muted-foreground";
  if (inverse) {
    if (value <= lowThreshold) return "text-emerald-400";
    if (value >= highThreshold) return "text-red-400";
  } else {
    if (value >= highThreshold) return "text-emerald-400";
    if (value <= lowThreshold) return "text-red-400";
  }
  return "text-yellow-400";
}

function Section({ title, icon, color, children }: { title: string; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-white/10 bg-gradient-to-r ${color}`}>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h3>
      </div>
      <div className="p-4 space-y-2">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, className, suffix }: { label: string; value: string; className?: string; suffix?: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${className || "text-foreground"}`}>
        {value}{suffix && <span className="text-muted-foreground ml-1">{suffix}</span>}
      </span>
    </div>
  );
}

function PriceRangeBar({ low, current, high, label }: { low: number; current: number; high: number; label: string }) {
  const range = high - low;
  const position = range > 0 ? ((current - low) / range) * 100 : 50;

  return (
    <div className="py-2">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
      </div>
      <div className="relative h-2 bg-gradient-to-r from-red-500/30 via-yellow-500/30 to-emerald-500/30 rounded-full">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-blue-500"
          style={{ left: `calc(${Math.min(Math.max(position, 0), 100)}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-red-400">${low.toFixed(2)}</span>
        <span className="text-emerald-400">${high.toFixed(2)}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, change, icon }: { label: string; value: string; change?: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-lg font-bold">{value}</div>
      {change !== undefined && (
        <div className={`text-xs ${getChangeColor(change)}`}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
        </div>
      )}
    </div>
  );
}


export function StockDetailsModal({ symbol, onClose }: StockDetailsModalProps) {
  const [details, setDetails] = useState<StockDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/stocks/${symbol}?details=true&refresh=true`);
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        setDetails(data);
      } catch {
        setError("Failed to load stock details");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [symbol]);

  useEffect(() => {
    const fetchNews = async () => {
      setNewsLoading(true);
      try {
        const response = await fetch(`/api/news?symbol=${symbol}&limit=5`);
        if (response.ok) {
          const data = await response.json();
          setNews(data);
        }
      } catch {
        // Silently fail for news
      } finally {
        setNewsLoading(false);
      }
    };
    fetchNews();
  }, [symbol]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const isPositive = (details?.change ?? 0) >= 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 py-6 px-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`relative overflow-hidden ${isPositive ? "bg-gradient-to-r from-emerald-500/10 to-transparent" : "bg-gradient-to-r from-red-500/10 to-transparent"}`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOGM5Ljk0MSAwIDE4LTguMDU5IDE4LTE4cy04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNHMxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjAyIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
          <div className="relative flex items-start justify-between p-6">
            <div>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-8 w-48 bg-white/10 animate-pulse rounded" />
                  <div className="h-4 w-32 bg-white/10 animate-pulse rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-white">
                      {details?.shortName || details?.longName || symbol}
                    </h2>
                    <span className="px-2.5 py-0.5 bg-white/10 rounded-full text-sm font-medium text-white/70">
                      {details?.symbol}
                    </span>
                    {details?.quoteType && (
                      <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium">
                        {details.quoteType}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/50 flex items-center gap-2">
                    <span>{details?.exchange}</span>
                    {details?.sector && (
                      <>
                        <span className="text-white/30">•</span>
                        <span className="text-purple-400">{details.sector}</span>
                      </>
                    )}
                    {details?.industry && (
                      <>
                        <span className="text-white/30">•</span>
                        <span>{details.industry}</span>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-white/50 hover:text-white hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          {/* Price Banner */}
          {!loading && details && (
            <div className="px-6 pb-6">
              <div className="flex items-end gap-6">
                <div>
                  <span className="text-5xl font-bold text-white">
                    {formatCurrency(details.price, details.currency)}
                  </span>
                </div>
                <div className={`flex items-center gap-2 pb-2 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                  <span className={`flex items-center justify-center w-8 h-8 rounded-full ${isPositive ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                    {isPositive ? "▲" : "▼"}
                  </span>
                  <span className="text-2xl font-semibold">
                    {details.change !== undefined && details.change >= 0 ? "+" : ""}
                    {formatNumber(details.change)}
                  </span>
                  <span className={`text-lg px-2 py-0.5 rounded ${isPositive ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
                    {formatPercentRaw(details.changePercent)}
                  </span>
                  {details.lastTradeTime && (
                    <span className="text-sm text-white/50 ml-2">
                      {formatTradeTime(details.lastTradeTime)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-white/50">Loading stock details...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-red-400">{error}</p>
              </div>
            </div>
          ) : details ? (
            <div className="space-y-6">
              {/* Key Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Market Cap"
                  value={formatLargeNumber(details.marketCap)}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                />
                <StatCard
                  label="P/E Ratio"
                  value={formatNumber(details.trailingPE)}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
                <StatCard
                  label="Dividend Yield"
                  value={details.dividendYield ? formatPercentRatio(details.dividendYield) : "N/A"}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <StatCard
                  label="Beta"
                  value={formatNumber(details.beta)}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>}
                />
              </div>

              {/* Price Ranges */}
              {details.fiftyTwoWeekLow && details.fiftyTwoWeekHigh && details.price && (
                <div className="rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 p-4">
                  <PriceRangeBar
                    low={details.fiftyTwoWeekLow}
                    current={details.price}
                    high={details.fiftyTwoWeekHigh}
                    label="52-Week Range"
                  />
                  {details.dayLow && details.dayHigh && (
                    <PriceRangeBar
                      low={details.dayLow}
                      current={details.price}
                      high={details.dayHigh}
                      label="Day Range"
                    />
                  )}
                </div>
              )}

              {/* Main Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Section
                  title="Trading"
                  color="from-blue-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>}
                >
                  <Row label="Open" value={formatCurrency(details.open, details.currency)} />
                  <Row label="Previous Close" value={formatCurrency(details.previousClose, details.currency)} />
                  <Row label="Day High" value={formatCurrency(details.dayHigh, details.currency)} className="text-emerald-400" />
                  <Row label="Day Low" value={formatCurrency(details.dayLow, details.currency)} className="text-red-400" />
                  <Row label="Volume" value={formatVolume(details.volume, 2)} />
                  <Row label="Avg Volume" value={formatVolume(details.avgVolume, 2)} />
                </Section>

                <Section
                  title="Valuation"
                  color="from-purple-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
                >
                  <Row label="Market Cap" value={formatLargeNumber(details.marketCap)} />
                  <Row label="Enterprise Value" value={formatLargeNumber(details.enterpriseValue)} />
                  <Row label="P/E (Trailing)" value={formatNumber(details.trailingPE)} className={getRatioColor(details.trailingPE, 10, 30, true)} />
                  <Row label="P/E (Forward)" value={formatNumber(details.forwardPE)} className={getRatioColor(details.forwardPE, 10, 25, true)} />
                  <Row label="Price/Book" value={formatNumber(details.priceToBook)} />
                  <Row label="Price/Sales" value={formatNumber(details.priceToSales)} />
                </Section>

                <Section
                  title="Dividends"
                  color="from-emerald-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                >
                  <Row label="Dividend Rate" value={formatCurrency(details.dividendRate, details.currency)} />
                  <Row label="Dividend Yield" value={formatPercentRatio(details.dividendYield)} className={details.dividendYield && details.dividendYield > 0.02 ? "text-emerald-400" : ""} />
                  <Row label="Ex-Dividend Date" value={details.exDividendDate || "-"} />
                  <Row label="Payout Ratio" value={formatPercentRatio(details.payoutRatio)} className={getRatioColor(details.payoutRatio, 0.3, 0.8, true)} />
                </Section>

                <Section
                  title="Financials"
                  color="from-amber-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                >
                  <Row label="Revenue" value={formatLargeNumber(details.revenue)} />
                  <Row label="Gross Profit" value={formatLargeNumber(details.grossProfit)} />
                  <Row label="EBITDA" value={formatLargeNumber(details.ebitda)} />
                  <Row label="Net Income" value={formatLargeNumber(details.netIncome)} className={getChangeColor(details.netIncome)} />
                  <Row label="EPS (Trailing)" value={formatCurrency(details.eps, details.currency)} />
                  <Row label="EPS (Forward)" value={formatCurrency(details.forwardEps, details.currency)} />
                </Section>

                <Section
                  title="Profitability"
                  color="from-cyan-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                >
                  <Row label="Profit Margin" value={formatPercentRatio(details.profitMargin)} className={getRatioColor(details.profitMargin, 0.05, 0.2, false)} />
                  <Row label="Operating Margin" value={formatPercentRatio(details.operatingMargin)} className={getRatioColor(details.operatingMargin, 0.1, 0.25, false)} />
                  <Row label="Return on Assets" value={formatPercentRatio(details.returnOnAssets)} className={getRatioColor(details.returnOnAssets, 0.05, 0.15, false)} />
                  <Row label="Return on Equity" value={formatPercentRatio(details.returnOnEquity)} className={getRatioColor(details.returnOnEquity, 0.1, 0.2, false)} />
                </Section>

                <Section
                  title="Balance Sheet"
                  color="from-rose-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>}
                >
                  <Row label="Total Cash" value={formatLargeNumber(details.totalCash)} className="text-emerald-400" />
                  <Row label="Total Debt" value={formatLargeNumber(details.totalDebt)} className="text-red-400" />
                  <Row label="Debt/Equity" value={formatNumber(details.debtToEquity)} className={getRatioColor(details.debtToEquity, 0.5, 2, true)} />
                  <Row label="Current Ratio" value={formatNumber(details.currentRatio)} className={getRatioColor(details.currentRatio, 1, 2, false)} />
                  <Row label="Book Value" value={formatCurrency(details.bookValue, details.currency)} />
                </Section>

                <Section
                  title="Shares & Short Interest"
                  color="from-indigo-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                >
                  <Row label="Shares Outstanding" value={formatVolume(details.sharesOutstanding, 2)} />
                  <Row label="Float" value={formatVolume(details.floatShares, 2)} />
                  <Row label="Shares Short" value={formatVolume(details.sharesShort, 2)} />
                  <Row label="Short Ratio" value={formatNumber(details.shortRatio)} className={getRatioColor(details.shortRatio, 3, 10, true)} />
                  <Row label="Short % of Float" value={formatPercentRatio(details.shortPercentOfFloat)} className={getRatioColor(details.shortPercentOfFloat, 0.05, 0.2, true)} />
                </Section>

                <Section
                  title="Analyst Ratings"
                  color="from-orange-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                >
                  <Row label="Target High" value={formatCurrency(details.targetHighPrice, details.currency)} className="text-emerald-400" />
                  <Row label="Target Mean" value={formatCurrency(details.targetMeanPrice, details.currency)} className="text-blue-400" />
                  <Row label="Target Low" value={formatCurrency(details.targetLowPrice, details.currency)} className="text-red-400" />
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">Recommendation</span>
                    {details.recommendationKey && (
                      <span className={`text-xs font-bold px-2 py-1 rounded ${getRecommendationColor(details.recommendationKey)}`}>
                        {details.recommendationKey.toUpperCase().replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <Row label="# of Analysts" value={details.numberOfAnalystOpinions?.toString() || "-"} />
                  <Row label="Earnings Date" value={details.earningsDate || "-"} className="text-yellow-400" />
                </Section>

                <Section
                  title="52-Week Performance"
                  color="from-teal-500/20 to-transparent"
                  icon={<svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                >
                  <Row label="52-Week High" value={formatCurrency(details.fiftyTwoWeekHigh, details.currency)} className="text-emerald-400" />
                  <Row label="52-Week Low" value={formatCurrency(details.fiftyTwoWeekLow, details.currency)} className="text-red-400" />
                  <Row label="52-Week Change" value={formatPercentRaw(details.fiftyTwoWeekChange ? details.fiftyTwoWeekChange * 100 : undefined)} className={getChangeColor(details.fiftyTwoWeekChange)} />
                  <Row label="50-Day Avg" value={formatCurrency(details.fiftyDayAverage, details.currency)} />
                  <Row label="200-Day Avg" value={formatCurrency(details.twoHundredDayAverage, details.currency)} />
                </Section>
              </div>

              {/* Description */}
              {details.description && (
                <div className="rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 p-5">
                  <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    About {details.shortName || details.symbol}
                  </h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    {details.description}
                  </p>
                  {details.website && (
                    <a
                      href={details.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mt-3 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {details.website}
                    </a>
                  )}
                </div>
              )}

              {/* News Section */}
              <div className="rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/10 bg-gradient-to-r from-cyan-500/20 to-transparent">
                  <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                    Recent News
                  </h3>
                </div>
                <div className="p-4 max-h-64 overflow-y-auto">
                  {newsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                    </div>
                  ) : news.length === 0 ? (
                    <p className="text-sm text-white/50 text-center py-4">No recent news available</p>
                  ) : (
                    <div className="space-y-3">
                      {news.map((article) => (
                        <a
                          key={article.uuid}
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                        >
                          {article.thumbnail ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={article.thumbnail}
                              alt=""
                              className="w-16 h-12 object-cover rounded-md shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-12 bg-cyan-500/10 rounded-md shrink-0 flex items-center justify-center">
                              <svg className="w-6 h-6 text-cyan-400/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-white/90 line-clamp-2 group-hover:text-cyan-400 transition-colors">
                              {article.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-white/50">
                              <span className="truncate">{article.publisher}</span>
                              <span>•</span>
                              <span className="shrink-0">{formatRelativeTime(article.publishedAt)}</span>
                            </div>
                          </div>
                          <svg className="w-4 h-4 text-white/30 group-hover:text-cyan-400 transition-colors shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
