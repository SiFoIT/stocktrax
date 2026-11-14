import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/body";
import { invalidatePortfolioSummary } from "@/lib/portfolio-summary";
import { db, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { normalizeTradeDate, resolveEditedTradeDate } from "@/lib/import/trade-date";

const updateCashTransactionSchema = z.object({
  type: z
    .enum(["contribution", "deposit", "refund", "referral", "transfer_in", "transfer_out", "fx_conversion"])
    .optional(),
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
  date: z
    .string()
    .transform((s, ctx) => {
      const date = normalizeTradeDate(s);
      if (!date) {
        ctx.addIssue({ code: "custom", message: `Invalid date: ${s}` });
        return z.NEVER;
      }
      return date;
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const portfolioId = url.searchParams.get("portfolioId");

  if (!portfolioId) {
    return NextResponse.json(
      { error: "portfolioId is required" },
      { status: 400 }
    );
  }

  const txns = await db.query.cashTransactions.findMany({
    where: eq(schema.cashTransactions.portfolioId, parseInt(portfolioId)),
  });

  const result = txns
    .map((t) => ({
      id: t.id,
      portfolioId: t.portfolioId,
      type: t.type,
      description: t.description,
      amount: t.amount,
      currency: t.currency,
      date:
        t.date instanceof Date
          ? t.date.toISOString()
          : new Date(t.date).toISOString(),
    }))
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

  return NextResponse.json(result);
}

async function handlePATCH(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const body = await readJsonBody(request);
    const validated = updateCashTransactionSchema.parse(body);

    const existing = await db.query.cashTransactions.findFirst({
      where: eq(schema.cashTransactions.id, parseInt(id)),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cash transaction not found" },
        { status: 404 }
      );
    }

    const updateSet: Record<string, unknown> = {};
    if (validated.type !== undefined) updateSet.type = validated.type;
    if (validated.description !== undefined) updateSet.description = validated.description;
    if (validated.amount !== undefined) updateSet.amount = validated.amount;
    if (validated.date !== undefined) {
      // Same calendar day keeps the stored timestamp (and so its order).
      updateSet.date = resolveEditedTradeDate(new Date(existing.date), validated.date);
    }

    const [updated] = await db
      .update(schema.cashTransactions)
      .set(updateSet)
      .where(eq(schema.cashTransactions.id, parseInt(id)))
      .returning();

    return NextResponse.json({ transaction: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update cash transaction" },
      { status: 500 }
    );
  }
}

async function handleDELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const portfolioId = url.searchParams.get("portfolioId");
  const all = url.searchParams.get("all");

  // Mass delete all cash transactions for a portfolio
  if (portfolioId && all === "true") {
    const pid = parseInt(portfolioId);
    const txns = await db.query.cashTransactions.findMany({
      where: eq(schema.cashTransactions.portfolioId, pid),
    });

    if (txns.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    await db
      .delete(schema.cashTransactions)
      .where(eq(schema.cashTransactions.portfolioId, pid));

    return NextResponse.json({ success: true, deleted: txns.length });
  }

  // Batch delete by JSON body with ids[]
  if (!id) {
    try {
      const body = await readJsonBody(request);
      const ids = (body as { ids?: unknown } | null)?.ids as number[];

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { error: "ids array is required" },
          { status: 400 }
        );
      }

      const txns = await db.query.cashTransactions.findMany({
        where: inArray(schema.cashTransactions.id, ids),
      });

      if (txns.length === 0) {
        return NextResponse.json(
          { error: "No cash transactions found" },
          { status: 404 }
        );
      }

      await db
        .delete(schema.cashTransactions)
        .where(inArray(schema.cashTransactions.id, ids));

      return NextResponse.json({ success: true, deleted: txns.length });
    } catch {
      return NextResponse.json(
        { error: "ID or ids[] is required" },
        { status: 400 }
      );
    }
  }

  // Single delete by query param
  const existing = await db.query.cashTransactions.findFirst({
    where: eq(schema.cashTransactions.id, parseInt(id)),
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Cash transaction not found" },
      { status: 404 }
    );
  }

  await db
    .delete(schema.cashTransactions)
    .where(eq(schema.cashTransactions.id, parseInt(id)));

  return NextResponse.json({ success: true });
}

// Every successful write changes figures on the dashboard summary, so its
// cache is dropped; the next read rebuilds it from the shared Yahoo cache.
export async function PATCH(request: NextRequest) {
  const response = await handlePATCH(request);
  if (response.ok) await invalidatePortfolioSummary();
  return response;
}
export async function DELETE(request: NextRequest) {
  const response = await handleDELETE(request);
  if (response.ok) await invalidatePortfolioSummary();
  return response;
}
