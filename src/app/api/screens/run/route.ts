import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getStockDetails, getHistoricalChanges } from "@/lib/api/yahoo-finance";
import { METRICS, PERFORMANCE_METRICS, evaluateRule, type ScreenRule, type ScreenOperator } from "@/lib/screener/metrics";

const runSchema = z.union([
  z.object({ screenId: z.number() }),
  z.object({
    source: z.string(),
    rules: z.array(z.object({
      metric: z.string(),
      operator: z.string(),
      value: z.number(),
      valueTo: z.number().optional(),
    })),
    match: z.enum(["all", "any"]),
  }),
]);

async function resolveSymbols(source: string): Promise<string[]> {
  const symbols = new Set<string>();

  if (source === "all" || source.startsWith("portfolio:")) {
    // Get symbols from holdings
    const holdings = await db.query.holdings.findMany();
    if (source === "all") {
      holdings.forEach((h) => symbols.add(h.symbol));
    } else {
      const portfolioId = parseInt(source.split(":")[1]);
      holdings
        .filter((h) => h.portfolioId === portfolioId)
        .forEach((h) => symbols.add(h.symbol));
    }
  }

  if (source === "all" || source.startsWith("watchlist:")) {
    // Get symbols from watchlist items
    const items = await db.query.watchlistItems.findMany();
    if (source === "all") {
      items.forEach((i) => symbols.add(i.symbol));
    } else {
      const watchlistId = parseInt(source.split(":")[1]);
      items
        .filter((i) => i.watchlistId === watchlistId)
        .forEach((i) => symbols.add(i.symbol));
    }
  }

  return Array.from(symbols);
}

async function fetchBatch<T>(
  items: string[],
  fn: (item: string) => Promise<T>,
  batchSize = 5
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const result = await fn(item);
          return [item, result] as const;
        } catch {
          return [item, null] as const;
        }
      })
    );
    for (const [key, value] of batchResults) {
      if (value !== null) results.set(key, value);
    }
  }
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = runSchema.parse(body);

    let source: string;
    let rules: ScreenRule[];
    let match: "all" | "any";

    if ("screenId" in parsed) {
      const screen = await db.query.screens.findFirst({
        where: eq(schema.screens.id, parsed.screenId),
      });
      if (!screen) {
        return NextResponse.json({ error: "Screen not found" }, { status: 404 });
      }
      source = screen.source;
      rules = JSON.parse(screen.rules);
      match = screen.match;
    } else {
      source = parsed.source;
      rules = parsed.rules as ScreenRule[];
      match = parsed.match;
    }

    if (rules.length === 0) {
      return NextResponse.json({ results: [], totalScanned: 0, matchCount: 0 });
    }

    const symbols = await resolveSymbols(source);
    if (symbols.length === 0) {
      return NextResponse.json({ results: [], totalScanned: 0, matchCount: 0 });
    }

    // Determine if we need historical changes
    const needsHistorical = rules.some((r) => PERFORMANCE_METRICS.has(r.metric));

    // Fetch stock details for all symbols
    const detailsMap = await fetchBatch(symbols, getStockDetails);

    // Fetch historical changes if needed
    let changesMap = new Map<string, Awaited<ReturnType<typeof getHistoricalChanges>>>();
    if (needsHistorical) {
      changesMap = await fetchBatch(symbols, getHistoricalChanges);
    }

    // Get the metric keys used in rules for result columns
    const usedMetrics = [...new Set(rules.map((r) => r.metric))];

    // Evaluate each symbol
    const results: {
      symbol: string;
      shortName?: string;
      price?: number;
      changePercent?: number;
      metricValues: Record<string, number | undefined>;
    }[] = [];

    for (const symbol of symbols) {
      const details = detailsMap.get(symbol);
      if (!details) continue;

      const changes = changesMap.get(symbol);

      // Compute all needed metric values
      const metricValues: Record<string, number | undefined> = {};
      for (const metricKey of usedMetrics) {
        const metricDef = METRICS[metricKey];
        if (metricDef) {
          metricValues[metricKey] = metricDef.compute(details, changes);
        }
      }

      // Evaluate rules
      const ruleResults = rules.map((rule) => {
        const value = metricValues[rule.metric];
        return evaluateRule(value, rule.operator as ScreenOperator, rule.value, rule.valueTo);
      });

      const passes = match === "all"
        ? ruleResults.every(Boolean)
        : ruleResults.some(Boolean);

      if (passes) {
        results.push({
          symbol,
          shortName: details.shortName,
          price: details.price,
          changePercent: details.changePercent,
          metricValues,
        });
      }
    }

    return NextResponse.json({
      results,
      totalScanned: symbols.length,
      matchCount: results.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Screen run error:", error);
    return NextResponse.json({ error: "Failed to run screen" }, { status: 500 });
  }
}
