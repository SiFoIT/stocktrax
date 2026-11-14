import { NextRequest, NextResponse } from "next/server";
import {
  getQuote,
  getTimeSeries,
  getHistoricalChanges,
  getStockDetails,
  getDividendInfo,
  getInsiderInfo,
  getInsiderDetails,
  getInstitutionalOwnership,
  TimeSeriesInterval,
} from "@/lib/api/yahoo-finance";

/**
 * One symbol's data, assembled from the shared Yahoo cache in
 * `src/lib/market-data/cache.ts`. Each part keeps its own lifetime there
 * (quote: minutes; history: topped up hourly; fundamentals, dividends and
 * insider data: half a day or more), so this route holds no cache of its own.
 * `refresh=true` refetches the quote only: nothing else changes within a
 * session, and re-downloading years of history per click is what made a
 * manual refresh cost a hundred Yahoo calls.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const url = new URL(request.url);
  const includeTimeSeries = url.searchParams.get("timeseries") === "true";
  const fresh = url.searchParams.get("refresh") === "true";
  const period = (url.searchParams.get("period") || "1y") as "1d" | "5d" | "1mo" | "3mo" | "1y" | "2y" | "3y" | "5y" | "10y";
  const interval = (url.searchParams.get("interval") || "1d") as TimeSeriesInterval;

  const includeChanges = url.searchParams.get("changes") === "true";
  const includeDetails = url.searchParams.get("details") === "true";
  const includeDividends = url.searchParams.get("dividends") === "true";
  const includeRange = url.searchParams.get("range") === "true";
  const includeInsider = url.searchParams.get("insider") === "true";
  const includeInsiderDetails = url.searchParams.get("insiderDetails") === "true";
  const includeInstitutionalOwnership = url.searchParams.get("institutionalOwnership") === "true";

  if (includeInstitutionalOwnership) {
    return NextResponse.json(await getInstitutionalOwnership(upperSymbol));
  }

  if (includeInsiderDetails) {
    return NextResponse.json(await getInsiderDetails(upperSymbol));
  }

  if (includeDetails) {
    const details = await getStockDetails(upperSymbol, { fresh });
    if (!details) {
      return NextResponse.json({ error: "Failed to fetch stock details" }, { status: 502 });
    }
    return NextResponse.json(details);
  }

  const [quote, timeSeries, historicalChanges, dividendInfo, insiderInfo] = await Promise.all([
    getQuote(upperSymbol, includeRange, { fresh }),
    includeTimeSeries ? getTimeSeries(upperSymbol, period, interval) : undefined,
    includeChanges ? getHistoricalChanges(upperSymbol) : undefined,
    includeDividends ? getDividendInfo(upperSymbol) : undefined,
    includeInsider ? getInsiderInfo(upperSymbol) : undefined,
  ]);

  if (!quote) {
    return NextResponse.json({ error: "Failed to fetch stock data" }, { status: 502 });
  }

  return NextResponse.json({ quote, timeSeries, historicalChanges, dividendInfo, insiderInfo });
}
