import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createPresetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  rules: z.array(z.object({
    metric: z.string(),
    operator: z.string(),
    value: z.number(),
    valueTo: z.number().optional(),
  })).min(1, "At least one rule is required"),
  match: z.enum(["all", "any"]).default("all"),
});

function formatPreset(row: typeof schema.screenPresets.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    rules: JSON.parse(row.rules),
    match: row.match,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET() {
  const rows = await db.query.screenPresets.findMany({
    orderBy: (presets, { asc }) => [asc(presets.createdAt)],
  });
  return NextResponse.json(rows.map(formatPreset));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createPresetSchema.parse(body);

    const [preset] = await db
      .insert(schema.screenPresets)
      .values({
        name: validated.name,
        rules: JSON.stringify(validated.rules),
        match: validated.match,
      })
      .returning();

    return NextResponse.json(formatPreset(preset), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create preset" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await db.delete(schema.screenPresets).where(eq(schema.screenPresets.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
