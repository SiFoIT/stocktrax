import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { recomputeHolding } from "@/lib/holdings";

const createTransactionSchema = z.object({
  portfolioId: z.number(),
  symbol: z.string().min(1).toUpperCase(),
  type: z.enum(["buy", "sell", "dividend", "transfer_in"]),
  shares: z.number().positive("Shares must be positive"),
  price: z.number().nonnegative("Price must be non-negative"),
  date: z.string().transform((s) => new Date(s)),
});

const updateTransactionSchema = z.object({
  type: z.enum(["buy", "sell", "dividend", "transfer_in"]).optional(),
  shares: z.number().positive("Shares must be positive").optional(),
  price: z.number().nonnegative("Price must be non-negative").optional(),
  date: z
    .string()
    .transform((s) => new Date(s))
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

  // Get all holdings for this portfolio
  const holdingsList = await db.query.holdings.findMany({
    where: eq(schema.holdings.portfolioId, parseInt(portfolioId)),
  });

  if (holdingsList.length === 0) {
    return NextResponse.json([]);
  }

  const holdingIds = holdingsList.map((h) => h.id);

  // Get all transactions for those holdings
  const txns = await db.query.transactions.findMany({
    where: inArray(schema.transactions.holdingId, holdingIds),
  });

  // Build a lookup map for holdings
  const holdingMap = new Map(holdingsList.map((h) => [h.id, h]));

  // Enrich transactions with symbol/currency
  const enriched = txns
    .map((t) => {
      const holding = holdingMap.get(t.holdingId);
      return {
        id: t.id,
        holdingId: t.holdingId,
        type: t.type,
        shares: t.shares,
        price: t.price,
        date:
          t.date instanceof Date
            ? t.date.toISOString()
            : new Date(t.date).toISOString(),
        symbol: holding?.symbol || "",
        currency: holding?.currency || "USD",
      };
    })
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createTransactionSchema.parse(body);

    // Find or create holding for this symbol in the portfolio
    let holding = await db.query.holdings.findFirst({
      where: and(
        eq(schema.holdings.portfolioId, validated.portfolioId),
        eq(schema.holdings.symbol, validated.symbol)
      ),
    });

    if (!holding) {
      if (validated.type === "sell") {
        return NextResponse.json(
          { error: "Cannot sell a symbol you don't own" },
          { status: 400 }
        );
      }

      // Inherit currency from the portfolio
      const portfolio = await db.query.portfolios.findFirst({
        where: eq(schema.portfolios.id, validated.portfolioId),
      });

      // Create new holding with zeroed values (will be recomputed)
      const [newHolding] = await db
        .insert(schema.holdings)
        .values({
          portfolioId: validated.portfolioId,
          symbol: validated.symbol,
          shares: 0,
          avgCost: 0,
          currency: portfolio?.currency ?? "USD",
        })
        .returning();

      holding = newHolding;
    }

    // Validate sells - can't sell more than owned
    if (validated.type === "sell") {
      if (validated.shares > holding.shares) {
        return NextResponse.json(
          {
            error: `Cannot sell ${validated.shares} shares. Only ${holding.shares} available.`,
          },
          { status: 400 }
        );
      }
    }

    // Insert transaction
    const [txn] = await db
      .insert(schema.transactions)
      .values({
        holdingId: holding.id,
        type: validated.type,
        shares: validated.shares,
        price: validated.price,
        date: validated.date,
      })
      .returning();

    // Recompute holding
    const updatedHolding = await recomputeHolding(holding.id);

    return NextResponse.json(
      {
        transaction: {
          ...txn,
          date:
            txn.date instanceof Date
              ? txn.date.toISOString()
              : new Date(txn.date).toISOString(),
          symbol: holding.symbol,
          currency: holding.currency,
        },
        holding: updatedHolding,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = updateTransactionSchema.parse(body);

    // Get existing transaction
    const existing = await db.query.transactions.findFirst({
      where: eq(schema.transactions.id, parseInt(id)),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Build update set
    const updateSet: Record<string, unknown> = {};
    if (validated.type !== undefined) updateSet.type = validated.type;
    if (validated.shares !== undefined) updateSet.shares = validated.shares;
    if (validated.price !== undefined) updateSet.price = validated.price;
    if (validated.date !== undefined) updateSet.date = validated.date;

    const [updated] = await db
      .update(schema.transactions)
      .set(updateSet)
      .where(eq(schema.transactions.id, parseInt(id)))
      .returning();

    // Recompute holding
    const updatedHolding = await recomputeHolding(existing.holdingId);

    return NextResponse.json({
      transaction: updated,
      holding: updatedHolding,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const portfolioId = url.searchParams.get("portfolioId");
  const all = url.searchParams.get("all");

  // Mass delete all transactions for a portfolio
  if (portfolioId && all === "true") {
    const pid = parseInt(portfolioId);
    const holdingsList = await db.query.holdings.findMany({
      where: eq(schema.holdings.portfolioId, pid),
    });

    if (holdingsList.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    const holdingIds = holdingsList.map((h) => h.id);
    const txns = await db.query.transactions.findMany({
      where: inArray(schema.transactions.holdingId, holdingIds),
    });

    if (txns.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }

    await db
      .delete(schema.transactions)
      .where(inArray(schema.transactions.holdingId, holdingIds));

    // Recompute all affected holdings
    for (const hid of holdingIds) {
      await recomputeHolding(hid);
    }

    return NextResponse.json({ success: true, deleted: txns.length });
  }

  // Batch delete by JSON body with ids[]
  if (!id) {
    try {
      const body = await request.json();
      const ids: number[] = body.ids;

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { error: "ids array is required" },
          { status: 400 }
        );
      }

      // Get all transactions to find their holdingIds
      const txns = await db.query.transactions.findMany({
        where: inArray(schema.transactions.id, ids),
      });

      if (txns.length === 0) {
        return NextResponse.json(
          { error: "No transactions found" },
          { status: 404 }
        );
      }

      const uniqueHoldingIds = [...new Set(txns.map((t) => t.holdingId))];

      await db
        .delete(schema.transactions)
        .where(inArray(schema.transactions.id, ids));

      // Recompute all affected holdings
      for (const hid of uniqueHoldingIds) {
        await recomputeHolding(hid);
      }

      return NextResponse.json({ success: true, deleted: txns.length });
    } catch {
      return NextResponse.json(
        { error: "ID or ids[] is required" },
        { status: 400 }
      );
    }
  }

  // Single delete by query param (existing behavior)
  const existing = await db.query.transactions.findFirst({
    where: eq(schema.transactions.id, parseInt(id)),
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Transaction not found" },
      { status: 404 }
    );
  }

  await db
    .delete(schema.transactions)
    .where(eq(schema.transactions.id, parseInt(id)));

  // Recompute holding
  const updatedHolding = await recomputeHolding(existing.holdingId);

  return NextResponse.json({ success: true, holding: updatedHolding });
}
