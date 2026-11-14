import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const LAST_RATE_KEY = "USDCAD_LAST_GOOD";

/** Used only if the rate has never once been fetched successfully. */
const BOOTSTRAP_RATE = 1.4;

export interface UsdCadRate {
  rate: number;
  /** True when the live fetch failed and this is the last good rate (or a guess). */
  stale: boolean;
}

/**
 * The USD→CAD rate to convert with. A live rate is remembered; when the live
 * fetch fails the last remembered rate is used and flagged stale, instead of
 * silently substituting a hardcoded figure that drifts from the market.
 */
export async function resolveUsdCadRate(live: number | undefined | null): Promise<UsdCadRate> {
  if (live != null && Number.isFinite(live) && live > 0) {
    await db
      .insert(schema.stockCache)
      .values({ symbol: LAST_RATE_KEY, data: JSON.stringify(live), fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.stockCache.symbol,
        set: { data: JSON.stringify(live), fetchedAt: new Date() },
      });
    return { rate: live, stale: false };
  }
  const row = await db.query.stockCache.findFirst({
    where: eq(schema.stockCache.symbol, LAST_RATE_KEY),
  });
  const last = row ? Number(JSON.parse(row.data)) : NaN;
  return { rate: Number.isFinite(last) && last > 0 ? last : BOOTSTRAP_RATE, stale: true };
}
