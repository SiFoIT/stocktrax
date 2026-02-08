import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const updateSchema = z.object({
  acknowledged: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const data = updateSchema.parse(await request.json());
    const set: Record<string, unknown> = {};
    if (data.acknowledged) {
      set.acknowledgedAt = new Date();
    }

    if (Object.keys(set).length === 0) {
      return NextResponse.json({ error: "No updates" }, { status: 400 });
    }

    const updated = await db
      .update(schema.alerts)
      .set(set)
      .where(eq(schema.alerts.id, id))
      .returning();

    return NextResponse.json(updated[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error("Failed to update alert", error);
    return NextResponse.json({ error: "Failed to update alert" }, { status: 500 });
  }
}
