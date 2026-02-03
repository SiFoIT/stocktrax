import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createPortfolioSchema = z.object({
  name: z.string().min(1, "Name is required"),
  currency: z.enum(["USD", "CAD"]).default("USD"),
});

export async function GET() {
  const portfolios = await db.query.portfolios.findMany({
    orderBy: (portfolios, { desc }) => [desc(portfolios.createdAt)],
  });
  return NextResponse.json(portfolios);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createPortfolioSchema.parse(body);

    const [portfolio] = await db
      .insert(schema.portfolios)
      .values(validated)
      .returning();

    return NextResponse.json(portfolio, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create portfolio" },
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

  await db.delete(schema.portfolios).where(eq(schema.portfolios.id, parseInt(id)));

  return NextResponse.json({ success: true });
}
