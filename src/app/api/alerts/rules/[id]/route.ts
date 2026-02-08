import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { alertMetrics, alertOperators, alertResetStrategies } from "@/lib/alerts/config";
import { eq } from "drizzle-orm";

const updateSchema = z.object({
  symbol: z.string().min(1).optional(),
  metric: z.enum(alertMetrics).optional(),
  operator: z.enum(alertOperators).optional(),
  threshold: z.number().optional(),
  resetStrategy: z.enum(alertResetStrategies).optional(),
  anchorValue: z.number().nullable().optional(),
  cooldownMinutes: z.number().optional(),
  action: z.enum(["reset", "ack"]).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = parseInt(params.id, 10);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const data = updateSchema.parse(await request.json());
    const set: Record<string, unknown> = { updatedAt: new Date() };

    if (data.symbol) set.symbol = data.symbol.toUpperCase();
    if (data.metric) set.metric = data.metric;
    if (data.operator) set.operator = data.operator;
    if (data.threshold !== undefined) set.threshold = data.threshold;
    if (data.resetStrategy) set.resetStrategy = data.resetStrategy;
    if (data.anchorValue !== undefined) set.anchorValue = data.anchorValue;
    if (data.cooldownMinutes !== undefined) set.cooldownMinutes = data.cooldownMinutes;

    if (data.action === "reset") {
      set.isMuted = false;
      set.needsRecovery = false;
      set.cooldownUntil = null;
      set.lastResetAt = new Date();
    }

    const updated = await db
      .update(schema.alertRules)
      .set(set)
      .where(eq(schema.alertRules.id, id))
      .returning();

    return NextResponse.json(updated[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to update alert rule", error);
    return NextResponse.json({ error: "Failed to update alert rule" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await db.delete(schema.alertRules).where(eq(schema.alertRules.id, id));
  return NextResponse.json({ success: true });
}
