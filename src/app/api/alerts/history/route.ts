import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { alertScopes } from "@/lib/alerts/config";
import type { SQL } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  const alerts = await db.query.alerts.findMany({
    where: (alertsTable, { and, eq, gte, lte }) => {
      const clauses: SQL[] = [];
      if (scope && alertScopes.includes(scope as (typeof alertScopes)[number])) {
        clauses.push(eq(alertsTable.scope, scope as (typeof alertScopes)[number]));
      }
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (from) clauses.push(gte(alertsTable.triggeredAt, new Date(from)));
      if (to) clauses.push(lte(alertsTable.triggeredAt, new Date(to)));
      if (clauses.length === 0) return undefined;
      if (clauses.length === 1) return clauses[0];
      return and(...clauses);
    },
    limit: Math.min(Math.max(limit, 1), 200),
    orderBy: (table, { desc }) => [desc(table.triggeredAt)],
  });

  return NextResponse.json(alerts);
}
