import { NextRequest, NextResponse } from "next/server";
import { getPerformance } from "@/lib/performance";

/** GET /api/performance?portfolioId=<id> — omit the id for all portfolios. */
export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("portfolioId");
  const portfolioId = raw == null ? undefined : Number(raw);
  if (portfolioId !== undefined && !Number.isInteger(portfolioId)) {
    return NextResponse.json({ error: "Invalid portfolioId" }, { status: 400 });
  }
  try {
    const data = await getPerformance(portfolioId);
    if (!data) return NextResponse.json({ error: "No activity to chart" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[performance] failed:", error);
    return NextResponse.json({ error: "Failed to compute performance" }, { status: 500 });
  }
}
