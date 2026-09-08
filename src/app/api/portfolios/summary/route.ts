import { NextResponse } from "next/server";
import { getPortfolioSummary } from "@/lib/portfolio-summary";

export async function GET() {
  try {
    return NextResponse.json(await getPortfolioSummary());
  } catch {
    return NextResponse.json(
      { error: "Failed to compute portfolio summary" },
      { status: 500 }
    );
  }
}
