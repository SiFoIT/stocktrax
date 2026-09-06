"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewsArticle, ExtendedHoursData, InsiderDetails, InstitutionalOwnership } from "@/types";
import { formatVolume, formatPercentRatio, formatRelativeTime } from "@/lib/utils";
import { ExtendedHoursLabel } from "@/components/ui/extended-hours-label";
import { InfoTip } from "@/components/ui/info-tip";

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
  extendedHours?: ExtendedHoursData;
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
  return value >= 0 ? "text-positive" : "text-negative";
}

function getRecommendationColor(key: string | undefined): string {
  if (!key) return "bg-gray-500/20 text-gray-400";
  switch (key.toLowerCase()) {
    case "strong_buy":
    case "strongbuy":
      return "bg-positive/20 text-positive border border-positive/30";
    case "buy":
      return "bg-positive/20 text-positive border border-positive/30";
    case "hold":
      return "bg-warning/20 text-warning border border-warning/30";
    case "sell":
      return "bg-muted text-muted-foreground border border-border";
    case "strong_sell":
    case "strongsell":
      return "bg-negative/20 text-negative border border-negative/30";
    default:
      return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
  }
}

function getRatioColor(value: number | undefined, lowThreshold: number, highThreshold: number, inverse = false): string {
  if (value === undefined || value === null) return "text-muted-foreground";
  if (inverse) {
    if (value <= lowThreshold) return "text-positive";
    if (value >= highThreshold) return "text-negative";
  } else {
    if (value >= highThreshold) return "text-positive";
    if (value <= lowThreshold) return "text-negative";
  }
  return "text-warning";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-2 p-4">{children}</div>
    </div>
  );
}

function Row({ label, value, className, suffix, tooltip }: { label: string; value: string; className?: string; suffix?: string; tooltip?: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">{label}{tooltip && <InfoTip text={tooltip} />}</span>
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
      <div className="relative h-1.5 rounded-full bg-foreground/15">
        <div
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `calc(${Math.min(Math.max(position, 0), 100)}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-negative">${low.toFixed(2)}</span>
        <span className="text-positive">${high.toFixed(2)}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, change }: { label: string; value: string; change?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tracking-tight text-foreground">{value}</div>
      {change !== undefined && (
        <div className={`text-xs ${getChangeColor(change)}`}>
          {change >= 0 ? "+" : "-"}{Math.abs(change).toFixed(2)}%
        </div>
      )}
    </div>
  );
}


function hasAnyValue(...values: (number | string | undefined | null)[]): boolean {
  return values.some((v) => v !== undefined && v !== null);
}

export function StockDetailsModal({ symbol, onClose }: StockDetailsModalProps) {
  const [details, setDetails] = useState<StockDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [insiderDetails, setInsiderDetails] = useState<InsiderDetails | null>(null);
  const [insiderLoading, setInsiderLoading] = useState(true);
  const [instOwnership, setInstOwnership] = useState<InstitutionalOwnership | null>(null);
  const [instLoading, setInstLoading] = useState(true);

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
    const fetchInsider = async () => {
      setInsiderLoading(true);
      try {
        const response = await fetch(`/api/stocks/${symbol}?insiderDetails=true`);
        if (response.ok) {
          const data = await response.json();
          setInsiderDetails(data);
        }
      } catch {
        // Silently fail for insider data
      } finally {
        setInsiderLoading(false);
      }
    };
    fetchInsider();
  }, [symbol]);

  useEffect(() => {
    const fetchInstitutional = async () => {
      setInstLoading(true);
      try {
        const response = await fetch(`/api/stocks/${symbol}?institutionalOwnership=true`);
        if (response.ok) {
          const data = await response.json();
          setInstOwnership(data);
        }
      } catch {
        // Silently fail
      } finally {
        setInstLoading(false);
      }
    };
    fetchInstitutional();
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
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 py-6 px-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg max-w-5xl w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`relative overflow-hidden ${isPositive ? "" : ""}`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOGM5Ljk0MSAwIDE4LTguMDU5IDE4LTE4cy04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNHMxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjAyIi8+PC9nPjwvc3ZnPg==')] opacity-30" />
          <div className="relative flex items-start justify-between p-6">
            <div>
              {loading ? (
                <div className="space-y-2">
                  <div className="h-8 w-48 bg-accent animate-pulse rounded" />
                  <div className="h-4 w-32 bg-accent animate-pulse rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {details?.shortName || details?.longName || symbol}
                    </h2>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                      {details?.symbol}
                    </span>
                    {details?.quoteType && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                        {details.quoteType}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>{details?.exchange}</span>
                    {details?.sector && (
                      <>
                        <span className="text-subtle-foreground">•</span>
                        <span>{details.sector}</span>
                      </>
                    )}
                    {details?.industry && (
                      <>
                        <span className="text-subtle-foreground">•</span>
                        <span>{details.industry}</span>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground hover:text-foreground hover:bg-accent">
              <X className="size-5" />
            </Button>
          </div>

          {/* Price Banner */}
          {!loading && details && (
            <div className="px-6 pb-6">
              <div className="flex items-end gap-6">
                <div>
                  <span className="text-3xl font-semibold tracking-tight text-foreground">
                    {formatCurrency(details.price, details.currency)}
                  </span>
                </div>
                <div className={`flex items-baseline gap-2 pb-1.5 ${isPositive ? "text-positive" : "text-negative"}`}>
                  <span className="text-lg font-semibold">
                    {details.change !== undefined && details.change >= 0 ? "+" : ""}
                    {formatNumber(details.change)}
                  </span>
                  <span className="text-lg font-semibold">
                    {formatPercentRaw(details.changePercent)}
                  </span>
                  {details.lastTradeTime && (
                    <span className="text-sm text-muted-foreground ml-2">
                      {formatTradeTime(details.lastTradeTime)}
                    </span>
                  )}
                </div>
              </div>
              {details.extendedHours && (
                <div className="mt-2">
                  <ExtendedHoursLabel extendedHours={details.extendedHours} currency={details.currency} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-muted-foreground">Loading stock details...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <svg className="w-5 h-5 text-subtle-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                <p className="text-negative">{error}</p>
              </div>
            </div>
          ) : details ? (
            <div className="space-y-6">
              {/* Key Stats Cards */}
              {hasAnyValue(details.marketCap, details.trailingPE, details.dividendYield, details.beta) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Market Cap"
                  value={formatLargeNumber(details.marketCap)}
                />
                <StatCard
                  label="P/E Ratio"
                  value={formatNumber(details.trailingPE)}
                />
                <StatCard
                  label="Dividend Yield"
                  value={details.dividendYield ? formatPercentRatio(details.dividendYield) : "N/A"}
                />
                <StatCard
                  label="Beta"
                  value={formatNumber(details.beta)}
                />
              </div>
              )}

              {/* Price Ranges */}
              {details.fiftyTwoWeekLow && details.fiftyTwoWeekHigh && details.price && (
                <div className="rounded-lg bg-card border border-border p-4">
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
                >
                  <Row label="Open" value={formatCurrency(details.open, details.currency)} />
                  <Row label="Previous Close" value={formatCurrency(details.previousClose, details.currency)} />
                  <Row label="Day High" value={formatCurrency(details.dayHigh, details.currency)} className="text-positive" />
                  <Row label="Day Low" value={formatCurrency(details.dayLow, details.currency)} className="text-negative" />
                  <Row label="Volume" value={formatVolume(details.volume, 2)} />
                  <Row label="Avg Volume" value={formatVolume(details.avgVolume, 2)} />
                </Section>

                {hasAnyValue(details.marketCap, details.enterpriseValue, details.trailingPE, details.forwardPE, details.priceToBook, details.priceToSales) && (
                <Section
                  title="Valuation"
                >
                  <Row label="Market Cap" value={formatLargeNumber(details.marketCap)} />
                  <Row label="Enterprise Value" value={formatLargeNumber(details.enterpriseValue)} />
                  <Row label="P/E (Trailing)" value={formatNumber(details.trailingPE)} className={getRatioColor(details.trailingPE, 10, 30, true)} />
                  <Row label="P/E (Forward)" value={formatNumber(details.forwardPE)} className={getRatioColor(details.forwardPE, 10, 25, true)} />
                  <Row label="Price/Book" value={formatNumber(details.priceToBook)} />
                  <Row label="Price/Sales" value={formatNumber(details.priceToSales)} />
                </Section>
                )}

                {hasAnyValue(details.dividendRate, details.dividendYield, details.exDividendDate, details.payoutRatio) && (
                <Section
                  title="Dividends"
                >
                  <Row label="Dividend Rate" value={formatCurrency(details.dividendRate, details.currency)} />
                  <Row label="Dividend Yield" value={formatPercentRatio(details.dividendYield)} className={details.dividendYield && details.dividendYield > 0.02 ? "text-positive" : ""} />
                  <Row label="Ex-Dividend Date" value={details.exDividendDate || "-"} />
                  <Row label="Payout Ratio" value={formatPercentRatio(details.payoutRatio)} className={getRatioColor(details.payoutRatio, 0.3, 0.8, true)} />
                </Section>
                )}

                {hasAnyValue(details.revenue, details.grossProfit, details.ebitda, details.netIncome, details.eps, details.forwardEps) && (
                <Section
                  title="Financials"
                >
                  <Row label="Revenue" value={formatLargeNumber(details.revenue)} />
                  <Row label="Gross Profit" value={formatLargeNumber(details.grossProfit)} />
                  <Row label="EBITDA" value={formatLargeNumber(details.ebitda)} />
                  <Row label="Net Income" value={formatLargeNumber(details.netIncome)} className={getChangeColor(details.netIncome)} />
                  <Row label="EPS (Trailing)" value={formatCurrency(details.eps, details.currency)} />
                  <Row label="EPS (Forward)" value={formatCurrency(details.forwardEps, details.currency)} />
                </Section>
                )}

                {hasAnyValue(details.profitMargin, details.operatingMargin, details.returnOnAssets, details.returnOnEquity) && (
                <Section
                  title="Profitability"
                >
                  <Row label="Profit Margin" value={formatPercentRatio(details.profitMargin)} className={getRatioColor(details.profitMargin, 0.05, 0.2, false)} />
                  <Row label="Operating Margin" value={formatPercentRatio(details.operatingMargin)} className={getRatioColor(details.operatingMargin, 0.1, 0.25, false)} />
                  <Row label="Return on Assets" value={formatPercentRatio(details.returnOnAssets)} className={getRatioColor(details.returnOnAssets, 0.05, 0.15, false)} />
                  <Row label="Return on Equity" value={formatPercentRatio(details.returnOnEquity)} className={getRatioColor(details.returnOnEquity, 0.1, 0.2, false)} />
                </Section>
                )}

                {hasAnyValue(details.totalCash, details.totalDebt, details.debtToEquity, details.currentRatio, details.bookValue) && (
                <Section
                  title="Balance Sheet"
                >
                  <Row label="Total Cash" value={formatLargeNumber(details.totalCash)} className="text-positive" />
                  <Row label="Total Debt" value={formatLargeNumber(details.totalDebt)} className="text-negative" />
                  <Row label="Debt/Equity" value={formatNumber(details.debtToEquity)} className={getRatioColor(details.debtToEquity, 0.5, 2, true)} />
                  <Row label="Current Ratio" value={formatNumber(details.currentRatio)} className={getRatioColor(details.currentRatio, 1, 2, false)} />
                  <Row label="Book Value" value={formatCurrency(details.bookValue, details.currency)} />
                </Section>
                )}

                {hasAnyValue(details.sharesOutstanding, details.floatShares, details.sharesShort, details.shortRatio, details.shortPercentOfFloat) && (
                <Section
                  title="Shares & Short Interest"
                >
                  <Row label="Shares Outstanding" value={formatVolume(details.sharesOutstanding, 2)} />
                  <Row label="Float" value={formatVolume(details.floatShares, 2)} />
                  <Row label="Shares Short" value={formatVolume(details.sharesShort, 2)} />
                  <Row label="Short Ratio" value={formatNumber(details.shortRatio)} className={getRatioColor(details.shortRatio, 3, 10, true)} />
                  {(() => {
                    const pct = details.shortPercentOfFloat ?? (details.sharesShort && details.floatShares && details.floatShares > 0 ? details.sharesShort / details.floatShares : undefined);
                    return <Row label="Short % of Float" value={formatPercentRatio(pct)} className={getRatioColor(pct, 0.05, 0.2, true)} />;
                  })()}
                </Section>
                )}

                <Section
                  title="Insider Activity"
                >
                  {insiderLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-warning/30 border-t-amber-500 rounded-full animate-spin" />
                    </div>
                  ) : insiderDetails ? (
                    <>
                      <Row label="Insider Ownership" value={insiderDetails.insidersPercentHeld !== undefined ? `${(insiderDetails.insidersPercentHeld * 100).toFixed(2)}%` : "-"} tooltip="Percentage of outstanding shares held by company insiders." />
                      <Row label="Buys (6mo)" value={insiderDetails.buyInfoCount !== undefined ? `${insiderDetails.buyInfoCount} txn · ${formatVolume(insiderDetails.buyInfoShares, 0)} shares` : "-"} className={insiderDetails.buyInfoCount ? "text-positive" : undefined} tooltip="Insider buy transactions and total shares purchased in the last 6 months." />
                      <Row label="Sells (6mo)" value={insiderDetails.sellInfoCount !== undefined ? `${insiderDetails.sellInfoCount} txn · ${formatVolume(insiderDetails.sellInfoShares, 0)} shares` : "-"} className={insiderDetails.sellInfoCount ? "text-negative" : undefined} tooltip="Insider sell transactions and total shares sold in the last 6 months." />
                      <Row
                        label="Net Shares"
                        value={insiderDetails.netInfoShares !== undefined ? insiderDetails.netInfoShares.toLocaleString() : "-"}
                        className={insiderDetails.netInfoShares !== undefined ? (insiderDetails.netInfoShares > 0 ? "text-positive" : insiderDetails.netInfoShares < 0 ? "text-negative" : undefined) : undefined}
                        tooltip="Net insider transaction count in the last 6 months (buys minus sells). This is a transaction count, not a share count."
                      />
                      <Row label="Total Insider Shares" value={formatVolume(insiderDetails.totalInsiderShares, 0)} tooltip="Total number of shares held by all company insiders." />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">No insider data available</p>
                  )}
                </Section>

                <Section
                  title="Institutional Ownership"
                >
                  {instLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                    </div>
                  ) : instOwnership ? (
                    <>
                      <Row label="Institutions % Held" value={instOwnership.institutionsPercentHeld !== undefined ? `${(instOwnership.institutionsPercentHeld * 100).toFixed(2)}%` : "-"} tooltip="Percentage of outstanding shares held by institutions." />
                      <Row label="Institutions Float % Held" value={instOwnership.institutionsFloatPercentHeld !== undefined ? `${(instOwnership.institutionsFloatPercentHeld * 100).toFixed(2)}%` : "-"} tooltip="Percentage of float shares held by institutions." />
                      <Row label="Number of Institutions" value={instOwnership.institutionsCount !== undefined ? instOwnership.institutionsCount.toLocaleString() : "-"} tooltip="Total number of institutional holders." />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">No institutional data available</p>
                  )}
                </Section>

                {hasAnyValue(details.targetHighPrice, details.targetMeanPrice, details.targetLowPrice, details.recommendationKey, details.numberOfAnalystOpinions) && (
                <Section
                  title="Analyst Ratings"
                >
                  <Row label="Target High" value={formatCurrency(details.targetHighPrice, details.currency)} className="text-positive" />
                  <Row label="Target Mean" value={formatCurrency(details.targetMeanPrice, details.currency)} className="text-primary" />
                  <Row label="Target Low" value={formatCurrency(details.targetLowPrice, details.currency)} className="text-negative" />
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-muted-foreground">Recommendation</span>
                    {details.recommendationKey && (
                      <span className={`text-xs font-bold px-2 py-1 rounded ${getRecommendationColor(details.recommendationKey)}`}>
                        {details.recommendationKey.toUpperCase().replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <Row label="# of Analysts" value={details.numberOfAnalystOpinions?.toString() || "-"} />
                  <Row label="Earnings Date" value={details.earningsDate || "-"} className="text-warning" />
                </Section>
                )}

                <Section
                  title="52-Week Performance"
                >
                  <Row label="52-Week High" value={formatCurrency(details.fiftyTwoWeekHigh, details.currency)} className="text-positive" />
                  <Row label="52-Week Low" value={formatCurrency(details.fiftyTwoWeekLow, details.currency)} className="text-negative" />
                  <Row label="52-Week Change" value={formatPercentRaw(details.fiftyTwoWeekChange ? details.fiftyTwoWeekChange * 100 : undefined)} className={getChangeColor(details.fiftyTwoWeekChange)} />
                  <Row label="50-Day Avg" value={formatCurrency(details.fiftyDayAverage, details.currency)} />
                  <Row label="200-Day Avg" value={formatCurrency(details.twoHundredDayAverage, details.currency)} />
                </Section>
              </div>

              {/* Insider Transactions Table */}
              {!insiderLoading && insiderDetails && insiderDetails.transactions.length > 0 && (
                <div className="rounded-lg bg-card border border-border overflow-hidden">
                  <div className="border-b border-border px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Recent Insider Transactions
                    </h3>
                  </div>
                  <div className="p-4 max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="text-left py-2 px-2">Date</th>
                          <th className="text-left py-2 px-2">Name</th>
                          <th className="text-left py-2 px-2">Role</th>
                          <th className="text-left py-2 px-2">Type</th>
                          <th className="text-right py-2 px-2">Shares</th>
                          <th className="text-right py-2 px-2">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insiderDetails.transactions.map((tx, i) => {
                          const isPurchase = tx.transactionText.includes("Purchase");
                          return (
                            <tr key={i} className={`border-b border-border`}>
                              <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{tx.startDate}</td>
                              <td className="py-2 px-2 text-foreground font-medium truncate max-w-[140px]">{tx.filerName}</td>
                              <td className="py-2 px-2 text-muted-foreground text-xs truncate max-w-[100px]">{tx.filerRelation}</td>
                              <td className="py-2 px-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                  isPurchase
                                    ? "bg-positive/20 text-positive"
                                    : "bg-negative/20 text-negative"
                                }`}>
                                  {isPurchase ? "Purchase" : "Sale"}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-muted-foreground">{tx.shares.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                                {tx.value ? `$${tx.value.toLocaleString()}` : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Institutional Holders Table */}
              {!instLoading && instOwnership && instOwnership.institutionHolders.length > 0 && (
                <div className="rounded-lg bg-card border border-border overflow-hidden">
                  <div className="border-b border-border px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Top Institutional Holders
                    </h3>
                  </div>
                  <div className="p-4 max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="text-left py-2 px-2">Name</th>
                          <th className="text-left py-2 px-2">Report Date</th>
                          <th className="text-right py-2 px-2">% Held</th>
                          <th className="text-right py-2 px-2">Shares</th>
                          <th className="text-right py-2 px-2">Value</th>
                          <th className="text-right py-2 px-2">% Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {instOwnership.institutionHolders.map((holder, i) => (
                          <tr key={i} className={`border-b border-border`}>
                            <td className="py-2 px-2 text-foreground font-medium truncate max-w-[180px]">{holder.organization}</td>
                            <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{holder.reportDate || "-"}</td>
                            <td className="py-2 px-2 text-right font-mono text-muted-foreground">{(holder.pctHeld * 100).toFixed(2)}%</td>
                            <td className="py-2 px-2 text-right font-mono text-muted-foreground">{holder.position.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-mono text-muted-foreground">{formatLargeNumber(holder.value)}</td>
                            <td className={`py-2 px-2 text-right font-mono ${holder.pctChange > 0 ? "text-positive" : holder.pctChange < 0 ? "text-negative" : "text-muted-foreground"}`}>
                              {holder.pctChange > 0 ? "+" : ""}{(holder.pctChange * 100).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fund Holders Table */}
              {!instLoading && instOwnership && instOwnership.fundHolders.length > 0 && (
                <div className="rounded-lg bg-card border border-border overflow-hidden">
                  <div className="border-b border-border px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-foreground">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                      Top Fund Holders
                    </h3>
                  </div>
                  <div className="p-4 max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="text-left py-2 px-2">Name</th>
                          <th className="text-left py-2 px-2">Report Date</th>
                          <th className="text-right py-2 px-2">% Held</th>
                          <th className="text-right py-2 px-2">Shares</th>
                          <th className="text-right py-2 px-2">Value</th>
                          <th className="text-right py-2 px-2">% Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {instOwnership.fundHolders.map((holder, i) => (
                          <tr key={i} className={`border-b border-border`}>
                            <td className="py-2 px-2 text-foreground font-medium truncate max-w-[180px]">{holder.organization}</td>
                            <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{holder.reportDate || "-"}</td>
                            <td className="py-2 px-2 text-right font-mono text-muted-foreground">{(holder.pctHeld * 100).toFixed(2)}%</td>
                            <td className="py-2 px-2 text-right font-mono text-muted-foreground">{holder.position.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right font-mono text-muted-foreground">{formatLargeNumber(holder.value)}</td>
                            <td className={`py-2 px-2 text-right font-mono ${holder.pctChange > 0 ? "text-positive" : holder.pctChange < 0 ? "text-negative" : "text-muted-foreground"}`}>
                              {holder.pctChange > 0 ? "+" : ""}{(holder.pctChange * 100).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Description */}
              {details.description && (
                <div className="rounded-lg bg-card border border-border p-5">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    <Info className="size-4" />
                    About {details.shortName || details.symbol}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {details.description}
                  </p>
                  {details.website && (
                    <a
                      href={details.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:text-blue-300 mt-3 transition-colors"
                    >
                      <ExternalLink className="size-4" />
                      {details.website}
                    </a>
                  )}
                </div>
              )}

              {/* News Section */}
              <div className="rounded-lg bg-card border border-border overflow-hidden">
                <div className="border-b border-border px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-foreground">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <p className="text-sm text-muted-foreground text-center py-4">No recent news available</p>
                  ) : (
                    <div className="space-y-3">
                      {news.map((article) => (
                        <a
                          key={article.uuid}
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex gap-3 p-2 rounded-lg hover:bg-muted transition-colors group"
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
                              <svg className="w-6 h-6 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                              {article.title}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="truncate">{article.publisher}</span>
                              <span>•</span>
                              <span className="shrink-0">{formatRelativeTime(article.publishedAt)}</span>
                            </div>
                          </div>
                          <ExternalLink className="size-4 text-subtle-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
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
