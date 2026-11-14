import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { alertMetrics, alertOperators, alertResetStrategies, alertScopes } from "@/lib/alerts/config";
import type { SQL } from "drizzle-orm";
import { getQuote } from "@/lib/api/yahoo-finance";
import { validPrice } from "@/lib/alerts/evaluate";

const createRuleSchema = z.object({
  scope: z.enum(alertScopes),
  symbol: z.string().min(1),
  watchlistItemId: z.number().optional(),
  holdingId: z.number().optional(),
  metric: z.enum(alertMetrics),
  operator: z.enum(alertOperators),
  threshold: z.number(),
  resetStrategy: z.enum(alertResetStrategies),
  anchorValue: z.number().optional().nullable(),
  cooldownMinutes: z.number().optional().default(60),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const watchlistItemId = url.searchParams.get("watchlistItemId");
  const holdingId = url.searchParams.get("holdingId");

  const rules = await db.query.alertRules.findMany({
    where: (alertRules, { and, eq }) => {
      const clauses: SQL[] = [];
      if (scope) clauses.push(eq(alertRules.scope, scope as (typeof alertScopes)[number]));
      if (watchlistItemId) clauses.push(eq(alertRules.watchlistItemId, Number(watchlistItemId)));
      if (holdingId) clauses.push(eq(alertRules.holdingId, Number(holdingId)));
      if (clauses.length === 0) return undefined;
      if (clauses.length === 1) return clauses[0];
      return and(...clauses);
    },
    orderBy: (table, { desc }) => [desc(table.updatedAt)],
  });

  return NextResponse.json(rules);
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const data = createRuleSchema.parse(json);

    // A blank anchor means "from today's price", so record that price now.
    // If the quote is unavailable the anchor stays null and the evaluator
    // sets it from the first good price it sees.
    let anchorValue = validPrice(data.anchorValue);
    if (anchorValue === null && data.metric === "price_vs_anchor") {
      const quote = await getQuote(data.symbol.trim().toUpperCase()).catch(() => null);
      anchorValue = validPrice(quote?.price);
    }

    const inserted = await db
      .insert(schema.alertRules)
      .values({
        scope: data.scope,
        symbol: data.symbol.trim().toUpperCase(),
        watchlistItemId: data.watchlistItemId,
        holdingId: data.holdingId,
        metric: data.metric,
        operator: data.operator,
        threshold: data.threshold,
        resetStrategy: data.resetStrategy,
        anchorValue,
        cooldownMinutes: data.cooldownMinutes,
        baselineValue: data.resetStrategy === "baseline" ? anchorValue : null,
        lastResetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to create alert rule", error);
    return NextResponse.json({ error: "Failed to create alert rule" }, { status: 500 });
  }
}
