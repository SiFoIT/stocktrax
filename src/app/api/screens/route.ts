import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createScreenSchema = z.object({
  name: z.string().min(1, "Name is required"),
  source: z.string().optional().default("all"),
  rules: z.array(z.object({
    metric: z.string(),
    operator: z.string(),
    value: z.number(),
    valueTo: z.number().optional(),
  })).optional().default([]),
  match: z.enum(["all", "any"]).optional().default("all"),
});

const updateScreenSchema = z.object({
  name: z.string().min(1).optional(),
  source: z.string().optional(),
  rules: z.array(z.object({
    metric: z.string(),
    operator: z.string(),
    value: z.number(),
    valueTo: z.number().optional(),
  })).optional(),
  match: z.enum(["all", "any"]).optional(),
});

function formatScreen(row: typeof schema.screens.$inferSelect) {
  return {
    ...row,
    rules: JSON.parse(row.rules),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const rows = await db.query.screens.findMany({
    orderBy: (screens, { asc }) => [asc(screens.createdAt)],
  });
  return NextResponse.json(rows.map(formatScreen));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createScreenSchema.parse(body);

    const [screen] = await db
      .insert(schema.screens)
      .values({
        name: validated.name,
        source: validated.source,
        rules: JSON.stringify(validated.rules),
        match: validated.match,
      })
      .returning();

    return NextResponse.json(formatScreen(screen), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create screen" }, { status: 500 });
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
    const validated = updateScreenSchema.parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.source !== undefined) updates.source = validated.source;
    if (validated.rules !== undefined) updates.rules = JSON.stringify(validated.rules);
    if (validated.match !== undefined) updates.match = validated.match;

    const [updated] = await db
      .update(schema.screens)
      .set(updates)
      .where(eq(schema.screens.id, parseInt(id)))
      .returning();

    return NextResponse.json(formatScreen(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update screen" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await db.delete(schema.screens).where(eq(schema.screens.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
