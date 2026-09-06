"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PortfolioDashboardData } from "@/types";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatCurrency, formatPercent, getChangeColor } from "@/lib/utils";

interface PortfolioSummaryListProps {
  data: PortfolioDashboardData | null;
  loading: boolean;
}

function ReturnCell({ amount, percent, currency = "CAD" }: { amount: number; percent: number; currency?: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`font-mono text-[12.5px] ${getChangeColor(amount)}`}>
        {formatCurrency(amount, currency)}
      </span>
      <span className={`text-xs ${getChangeColor(percent)}`}>
        {formatPercent(percent)}
      </span>
    </div>
  );
}

export function PortfolioSummaryList({ data, loading }: PortfolioSummaryListProps) {
  if (loading) {
    return (
      <Panel>
        <PanelHeader title="Portfolios" />
        <PanelBody className="space-y-2 p-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </PanelBody>
      </Panel>
    );
  }

  if (!data || data.portfolios.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">No portfolios yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first portfolio from the Portfolios menu above.
        </p>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const yearKeys = [currentYear.toString(), prevYear.toString()];

  return (
    <Panel>
      <PanelHeader title="Portfolios" meta="All values in CAD" />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-left">Portfolio</th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">Today</th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">Market Value</th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">Cost Basis</th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">% Total</th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">{currentYear}</th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">{prevYear}</th>
              <th className="px-3.5 py-2 text-[11.5px] font-medium text-muted-foreground text-right">Inception</th>
            </tr>
          </thead>
          <tbody>
            {data.portfolios.map((portfolio) => (
              <tr
                key={portfolio.id}
                className="border-b border-border transition-colors hover:bg-accent/40 group cursor-pointer"
              >
                <td className="px-3.5 py-3">
                  <Link
                    href={`/portfolio/${portfolio.id}`}
                    className="flex items-center gap-3 group/link"
                  >
                    <div>
                      <span className="text-sm font-medium text-foreground transition-colors group-hover/link:text-primary">
                        {portfolio.name}
                      </span>
                      <span className="block text-xs text-subtle-foreground">
                        Created {new Date(portfolio.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    <ArrowUpRight className="ml-1 size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </td>
                <td className="px-4 py-4 text-right">
                  <ReturnCell amount={portfolio.todayReturn} percent={portfolio.todayReturnPercent} />
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-semibold text-foreground">
                    {formatCurrency(portfolio.marketValue, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-foreground/80">
                    {formatCurrency(portfolio.costBasis, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-foreground/80">
                    {portfolio.percentOfTotal.toFixed(1)}%
                  </span>
                </td>
                {yearKeys.map((year) => {
                  const yr = portfolio.yearlyReturns[year];
                  return (
                    <td key={year} className="px-4 py-4 text-right">
                      {yr ? (
                        <ReturnCell amount={yr.amount} percent={yr.percent} />
                      ) : (
                        <span className="text-subtle-foreground">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-4 text-right">
                  <ReturnCell
                    amount={portfolio.sinceInception.amount}
                    percent={portfolio.sinceInception.percent}
                  />
                </td>
              </tr>
            ))}
            {/* Totals row */}
            {data.portfolios.length > 1 && (
              <tr className="border-t-2 border-border bg-muted">
                <td className="px-3.5 py-3">
                  <span className="font-bold text-foreground">Total</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <ReturnCell amount={data.totals.todayReturn} percent={data.totals.todayReturnPercent} />
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(data.totals.marketValue, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-bold text-foreground/80">
                    {formatCurrency(data.totals.costBasis, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-bold text-foreground/80">100%</span>
                </td>
                <td className="px-3.5 py-3" colSpan={2}></td>
                <td className="px-4 py-4 text-right">
                  <ReturnCell amount={data.totals.gainLoss} percent={data.totals.gainLossPercent} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
