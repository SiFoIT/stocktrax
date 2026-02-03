import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  if (!query || query.length < 1) {
    return NextResponse.json([]);
  }

  try {
    const results = await yahooFinance.search(query, { quotesCount: 8 });

    const suggestions = results.quotes
      .filter((q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF" || q.quoteType === "CRYPTOCURRENCY"))
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType,
        exchange: q.exchange,
      }));

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json([]);
  }
}
