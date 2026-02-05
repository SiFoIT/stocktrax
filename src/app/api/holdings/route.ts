import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const createHoldingSchema = z.object({
  portfolioId: z.number(),
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  shares: z.number().positive("Shares must be positive"),
  avgCost: z.number().positive("Average cost must be positive"),
  currency: z.string().default("USD"),
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

  const holdings = await db.query.holdings.findMany({
    where: eq(schema.holdings.portfolioId, parseInt(portfolioId)),
  });

  return NextResponse.json(holdings);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createHoldingSchema.parse(body);

    // Check if holding already exists for this symbol in portfolio
    const existing = await db.query.holdings.findFirst({
      where: and(
        eq(schema.holdings.portfolioId, validated.portfolioId),
        eq(schema.holdings.symbol, validated.symbol)
      ),
    });

    if (existing) {
      // Update existing holding with weighted average cost
      const totalShares = existing.shares + validated.shares;
      const totalCost =
        existing.shares * existing.avgCost + validated.shares * validated.avgCost;
      const newAvgCost = totalCost / totalShares;

      const [updated] = await db
        .update(schema.holdings)
        .set({
          shares: totalShares,
          avgCost: newAvgCost,
        })
        .where(eq(schema.holdings.id, existing.id))
        .returning();

      // Record transaction
      await db.insert(schema.transactions).values({
        holdingId: existing.id,
        type: "buy",
        shares: validated.shares,
        price: validated.avgCost,
        date: new Date(),
      });

      return NextResponse.json(updated);
    }

    // Create new holding
    const [holding] = await db
      .insert(schema.holdings)
      .values(validated)
      .returning();

    // Record transaction
    await db.insert(schema.transactions).values({
      holdingId: holding.id,
      type: "buy",
      shares: validated.shares,
      price: validated.avgCost,
      date: new Date(),
    });

    return NextResponse.json(holding, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error creating holding:", error);
    return NextResponse.json(
      { error: "Failed to create holding" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await db.delete(schema.holdings).where(eq(schema.holdings.id, parseInt(id)));

  return NextResponse.json({ success: true });
}

const updateHoldingSchema = z.object({
  shares: z.number().positive("Shares must be positive"),
  avgCost: z.number().positive("Average cost must be positive"),
});

export async function PATCH(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validated = updateHoldingSchema.parse(body);

    const [updated] = await db
      .update(schema.holdings)
      .set({
        shares: validated.shares,
        avgCost: validated.avgCost,
      })
      .where(eq(schema.holdings.id, parseInt(id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating holding:", error);
    return NextResponse.json(
      { error: "Failed to update holding" },
      { status: 500 }
    );
  }
}
