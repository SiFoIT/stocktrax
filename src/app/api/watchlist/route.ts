import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const addSymbolSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
});

export async function GET() {
  const items = await db.query.watchlist.findMany({
    orderBy: (watchlist, { desc }) => [desc(watchlist.addedAt)],
  });

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = addSymbolSchema.parse(body);

    // Check if symbol already exists
    const existing = await db.query.watchlist.findFirst({
      where: eq(schema.watchlist.symbol, validated.symbol),
    });

    if (existing) {
      return NextResponse.json(
        { error: "Symbol already in watchlist" },
        { status: 409 }
      );
    }

    const [item] = await db
      .insert(schema.watchlist)
      .values({ symbol: validated.symbol })
      .returning();

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error adding to watchlist:", error);
    return NextResponse.json(
      { error: "Failed to add to watchlist" },
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

  await db.delete(schema.watchlist).where(eq(schema.watchlist.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
