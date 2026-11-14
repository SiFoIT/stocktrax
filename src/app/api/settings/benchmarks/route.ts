import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/http/body";
import { getQuote } from "@/lib/api/yahoo-finance";
import {
  BENCHMARK_PRESETS,
  getBenchmarks,
  MAX_BENCHMARKS,
  setBenchmarks,
  toBenchmark,
} from "@/lib/benchmarks";
import { invalidatePerformance } from "@/lib/performance";

export const runtime = "nodejs";

const bodySchema = z.object({
  symbols: z
    .array(z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()))
    .min(1, "Choose at least one benchmark")
    .max(MAX_BENCHMARKS, `At most ${MAX_BENCHMARKS} benchmarks`),
});

/** The chosen benchmarks plus the presets the picker offers. */
export async function GET() {
  return NextResponse.json({
    selected: await getBenchmarks(),
    presets: BENCHMARK_PRESETS.map((p) => ({ ...p, preset: true })),
    max: MAX_BENCHMARKS,
  });
}

export async function PUT(request: NextRequest) {
  const parsed = bodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid benchmarks" }, { status: 400 });
  }
  const symbols = [...new Set(parsed.data.symbols)];

  // A custom symbol must be one Yahoo can price, or the chart would show a
  // line that never exists. Presets are known good.
  const presets = new Set(BENCHMARK_PRESETS.map((p) => p.symbol));
  const unknown = (
    await Promise.all(symbols.map(async (s) => (presets.has(s) || (await getQuote(s)) ? null : s)))
  ).filter((s): s is string => s !== null);
  if (unknown.length > 0) {
    return NextResponse.json({ error: `No price data for ${unknown.join(", ")}` }, { status: 400 });
  }

  await setBenchmarks(symbols);
  await invalidatePerformance();
  return NextResponse.json({ selected: symbols.map(toBenchmark) });
}
