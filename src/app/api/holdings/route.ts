import { NextRequest, NextResponse } from "next/server";
import { invalidatePortfolioSummary } from "@/lib/portfolio-summary";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

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

async function handleDELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const holdingId = Number(id);
  if (!Number.isInteger(holdingId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const deleted = await db.delete(schema.holdings).where(eq(schema.holdings.id, holdingId)).returning();
  if (deleted.length === 0) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// Every successful write changes figures on the dashboard summary, so its
// cache is dropped; the next read rebuilds it from the shared Yahoo cache.
export async function DELETE(request: NextRequest) {
  const response = await handleDELETE(request);
  if (response.ok) await invalidatePortfolioSummary();
  return response;
}
