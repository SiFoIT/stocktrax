"use client";

import Link from "next/link";
import { PortfolioDashboardData } from "@/types";
import { formatCurrency, formatPercent, getChangeColor, getChangeBg } from "@/lib/utils";

interface PortfolioSummaryListProps {
  data: PortfolioDashboardData | null;
  loading: boolean;
}

function ReturnCell({ amount, percent, currency = "CAD" }: { amount: number; percent: number; currency?: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`inline-block px-2 py-0.5 rounded-md text-sm font-medium ${getChangeBg(amount)} ${getChangeColor(amount)}`}>
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
      <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="font-semibold text-black dark:text-white">Portfolios</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.portfolios.length === 0) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 p-12">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Portfolios Yet</h3>
          <p className="text-black/50 dark:text-white/50">Create your first portfolio using the dropdown above.</p>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const yearKeys = [currentYear.toString(), prevYear.toString()];

  return (
    <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-black dark:text-white">Portfolios</h2>
            <p className="text-xs text-black/50 dark:text-white/50">All values in CAD</p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-left">Portfolio</th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Today</th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Market Value</th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Cost Basis</th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">% Total</th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">{currentYear}</th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">{prevYear}</th>
              <th className="px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right">Inception</th>
            </tr>
          </thead>
          <tbody>
            {data.portfolios.map((portfolio, index) => (
              <tr
                key={portfolio.id}
                className={`border-b border-white/5 transition-all hover:bg-emerald-500/5 group cursor-pointer ${
                  index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""
                }`}
              >
                <td className="px-4 py-4">
                  <Link
                    href={`/portfolio/${portfolio.id}`}
                    className="flex items-center gap-3 group/link"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center group-hover/link:from-emerald-500/30 group-hover/link:to-teal-500/30 transition-all flex-shrink-0">
                      <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-semibold text-black dark:text-white group-hover/link:text-emerald-400 transition-colors">
                        {portfolio.name}
                      </span>
                      <span className="block text-xs text-black/40 dark:text-white/40">
                        Created {new Date(portfolio.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    <svg className="w-4 h-4 text-black/20 dark:text-white/20 group-hover/link:text-emerald-400 transition-colors ml-1 opacity-0 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </td>
                <td className="px-4 py-4 text-right">
                  <ReturnCell amount={portfolio.todayReturn} percent={portfolio.todayReturnPercent} />
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-semibold text-black dark:text-white">
                    {formatCurrency(portfolio.marketValue, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-black/70 dark:text-white/70">
                    {formatCurrency(portfolio.costBasis, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-black/70 dark:text-white/70">
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
                        <span className="text-black/30 dark:text-white/30">-</span>
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
              <tr className="border-t-2 border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04]">
                <td className="px-4 py-4">
                  <span className="font-bold text-black dark:text-white">Total</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <ReturnCell amount={data.totals.todayReturn} percent={data.totals.todayReturnPercent} />
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-bold text-black dark:text-white">
                    {formatCurrency(data.totals.marketValue, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-bold text-black/70 dark:text-white/70">
                    {formatCurrency(data.totals.costBasis, "CAD")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono font-bold text-black/70 dark:text-white/70">100%</span>
                </td>
                <td className="px-4 py-4" colSpan={2}></td>
                <td className="px-4 py-4 text-right">
                  <ReturnCell amount={data.totals.gainLoss} percent={data.totals.gainLossPercent} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
