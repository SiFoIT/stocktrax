import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import type { AlertRunPayload } from "@/lib/alerts/evaluate";

const watchlistSourceSchema = z.object({
  id: z.number(),
  watchlistId: z.number(),
  symbol: z.string(),
  price: z.number().nullable().optional(),
  changePercent: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

const holdingSourceSchema = z.object({
  id: z.number(),
  portfolioId: z.number(),
  symbol: z.string(),
  currentPrice: z.number().nullable().optional(),
  gainLossPercent: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
});

const payloadSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("watchlist"), items: z.array(watchlistSourceSchema) }),
  z.object({ scope: z.literal("holding"), holdings: z.array(holdingSourceSchema) }),
]);

export async function POST(request: NextRequest) {
  try {
    const body = payloadSchema.parse(await request.json());
    const rules = await db.query.alertRules.findMany({
      where: eq(schema.alertRules.scope, body.scope),
    });

    if (rules.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    const { triggered, updates } = evaluateAlerts(body as AlertRunPayload, rules);

    if (updates.length > 0) {
      for (const update of updates) {
        const set: Record<string, unknown> = { updatedAt: new Date() };
        if (update.needsRecovery !== undefined) set.needsRecovery = update.needsRecovery;
        if (update.isMuted !== undefined) set.isMuted = update.isMuted;
        if (update.cooldownUntil !== undefined) set.cooldownUntil = update.cooldownUntil;
        if (update.baselineValue !== undefined) set.baselineValue = update.baselineValue;
        if (update.lastTriggeredAt !== undefined) set.lastTriggeredAt = update.lastTriggeredAt;
        await db
          .update(schema.alertRules)
          .set(set)
          .where(eq(schema.alertRules.id, update.id));
      }
    }

    if (triggered.length === 0) {
      return NextResponse.json({ alerts: [] });
    }

    const inserted = await db
      .insert(schema.alerts)
      .values(
        triggered.map((event) => ({
          ruleId: event.rule.id,
          scope: event.scope,
          symbol: event.symbol,
          message: event.message,
          metricValue: event.metricValue,
          price: event.price ?? null,
          changePercent: event.changePercent ?? null,
          resetStrategy: event.rule.resetStrategy,
          operator: event.rule.operator,
          threshold: event.rule.threshold,
        }))
      )
      .returning();

    return NextResponse.json({ alerts: inserted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to run alerts", error);
    return NextResponse.json({ error: "Failed to evaluate alerts" }, { status: 500 });
  }
}
