import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { getDailyHistory, getDividendInfo, getQuote } from "@/lib/api/yahoo-finance";
import { resolveUsdCadRate } from "@/lib/fx";
import { zonedDateStr } from "@/lib/digest/time";
import {
  addDays,
  buildDividendCalendar,
  type PositionInput,
  type ReceivedInput,
} from "@/lib/dividend-calendar";

const querySchema = z.object({
  portfolioId: z.coerce.number().int().positive().optional(),
});

/** The calendar day of a stored transaction (stored at 12:00 UTC). */
const txDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /api/dividend-calendar?portfolioId=<id>
 * Received dividends for the past 12 months and expected dividends for the
 * next 12, in CAD. Omit portfolioId for all portfolios. See
 * src/lib/dividend-calendar.ts for the window and projection rules.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    portfolioId: request.nextUrl.searchParams.get("portfolioId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid portfolioId" }, { status: 400 });
  }
  const { portfolioId } = parsed.data;

  try {
    const holdings = portfolioId
      ? await db.query.holdings.findMany({ where: eq(schema.holdings.portfolioId, portfolioId) })
      : await db.query.holdings.findMany();

    const holdingById = new Map(holdings.map((h) => [h.id, h]));
    const transactions =
      holdings.length === 0
        ? []
        : await db.query.transactions.findMany({
            where: inArray(
              schema.transactions.holdingId,
              holdings.map((h) => h.id)
            ),
          });

    const received: ReceivedInput[] = [];
    for (const t of transactions) {
      if (t.type !== "dividend") continue;
      const h = holdingById.get(t.holdingId);
      if (!h) continue;
      received.push({ symbol: h.symbol, day: txDay(t.date), shares: t.shares, price: t.price, currency: h.currency });
    }

    // Current positions, merged by symbol across portfolios.
    const held = new Map<string, { shares: number; currency: string }>();
    for (const h of holdings) {
      if (h.shares <= 0) continue;
      const prev = held.get(h.symbol);
      held.set(h.symbol, { shares: (prev?.shares ?? 0) + h.shares, currency: prev?.currency ?? h.currency });
    }
    const symbols = [...held.keys()];

    const today = zonedDateStr(new Date(), "America/Toronto");
    const from = addDays(today, -470);

    const [fxQuote, histories, infos, quotes] = await Promise.all([
      getQuote("USDCAD=X"),
      Promise.all(symbols.map((s) => getDailyHistory(s, from))),
      Promise.all(symbols.map((s) => getDividendInfo(s).catch(() => ({})))),
      Promise.all(symbols.map((s) => getQuote(s, true).catch(() => null))),
    ]);
    const fx = await resolveUsdCadRate(fxQuote?.price);

    const positions: PositionInput[] = symbols.map((symbol, i) => {
      const h = held.get(symbol)!;
      // Dividends are paid in the listing's currency; only USD/CAD are
      // convertible here, so anything else falls back to the holding's.
      const qc = (quotes[i] as { currency?: string } | null)?.currency;
      const info = infos[i] as { exDividendDate?: string; dividendDate?: string };
      return {
        symbol,
        shares: h.shares,
        currency: qc === "USD" || qc === "CAD" ? qc : h.currency,
        history: histories[i]?.dividends ?? null,
        exDividendDate: info.exDividendDate,
        dividendDate: info.dividendDate,
      };
    });

    return NextResponse.json(
      buildDividendCalendar({ today, usdCadRate: fx.rate, fxStale: fx.stale, received, positions })
    );
  } catch (error) {
    console.error("dividend-calendar failed", error);
    return NextResponse.json({ error: "Failed to build dividend calendar" }, { status: 500 });
  }
}
