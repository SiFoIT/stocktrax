import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createWatchlistSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export async function GET() {
  const watchlists = await db.query.watchlists.findMany({
    orderBy: (watchlists, { asc }) => [asc(watchlists.createdAt)],
  });

  return NextResponse.json(watchlists);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createWatchlistSchema.parse(body);

    const [watchlist] = await db
      .insert(schema.watchlists)
      .values({ name: validated.name })
      .returning();

    return NextResponse.json(watchlist, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error creating watchlist:", error);
    return NextResponse.json(
      { error: "Failed to create watchlist" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const body = await request.json();
    const validated = createWatchlistSchema.parse(body);

    const [updated] = await db
      .update(schema.watchlists)
      .set({ name: validated.name })
      .where(eq(schema.watchlists.id, parseInt(id)))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Error updating watchlist:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist" },
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

  await db.delete(schema.watchlists).where(eq(schema.watchlists.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
