import { NextRequest, NextResponse } from "next/server";
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

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await db.delete(schema.holdings).where(eq(schema.holdings.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
