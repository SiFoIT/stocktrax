"use client";

import { useEffect, useMemo, useState } from "react";
import { WatchlistItemWithQuote } from "@/types";
import { formatPercent, getChangeColor } from "@/lib/utils";
import { getNextMarketTransition } from "@/lib/markets/calendar";
import { StatCard } from "@/components/ui/stat-card";
import { StockIcon } from "@/components/ui/stock-icon";

/**
 * Placeholders keep every tile at its final height from the first paint, so the
 * Markets panel below never shifts when data lands.
 */
const NO_VALUE = "–";
const NO_SUB = "\u00A0";

interface MarketGlanceProps {
  watchlistItems: WatchlistItemWithQuote[];
  watchlistLoading: boolean;
  /** Triggered alerts across both the market and watchlist scopes. */
  alertSymbols: string[];
  onSelectSymbol: (symbol: string) => void;
  onOpenAlerts: () => void;
}

const etTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

const etWeekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
});

const etDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function describeTransition(open: boolean, at: Date, now: Date): string {
  const verb = open ? "Closes" : "Opens";
  const sameDay = etDay.format(at) === etDay.format(now);
  const day = sameDay ? "" : `${etWeekday.format(at)} `;
  return `${verb} ${day}${etTime.format(at)} ET`;
}

/** Resolved on the client only: the answer depends on "now", which the server cannot share. */
function useMarketTransition() {
  const [state, setState] = useState<{ open: boolean; label: string } | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const { open, at } = getNextMarketTransition(now);
      setState({ open, label: describeTransition(open, at, now) });
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return state;
}

/**
 * The four-tile row above the Markets panel: what the market is doing, what the
 * watchlist is doing, and whether anything needs attention.
 */
export function MarketGlance({
  watchlistItems,
  watchlistLoading,
  alertSymbols,
  onSelectSymbol,
  onOpenAlerts,
}: MarketGlanceProps) {
  const market = useMarketTransition();

  const { gainer, loser } = useMemo(() => {
    const movable = watchlistItems.filter(
      (item): item is WatchlistItemWithQuote & { changePercent: number } =>
        typeof item.changePercent === "number" && Number.isFinite(item.changePercent)
    );
    if (movable.length === 0) return { gainer: null, loser: null };
    let best = movable[0];
    let worst = movable[0];
    for (const item of movable) {
      if (item.changePercent > best.changePercent) best = item;
      if (item.changePercent < worst.changePercent) worst = item;
    }
    return { gainer: best, loser: worst };
  }, [watchlistItems]);

  // An empty watchlist is a settled answer; a loading one is not yet.
  const moverSub = watchlistLoading ? NO_SUB : "No watchlist symbols";

  const alertCount = alertSymbols.length;
  const alertSub = useMemo(() => {
    if (alertSymbols.length === 0) return NO_SUB;
    const shown = alertSymbols.slice(0, 2).join(" · ");
    const rest = alertSymbols.length - 2;
    return rest > 0 ? `${shown} +${rest}` : shown;
  }, [alertSymbols]);

  const moverTile = (
    label: string,
    item: (WatchlistItemWithQuote & { changePercent: number }) | null
  ) => (
    <StatCard
      label={label}
      value={
        item ? (
          // The 24px icon sits inside the value line's 28px leading, so adding it
          // does not change the tile's height.
          <span className="flex items-center gap-2">
            <StockIcon symbol={item.symbol} size="sm" />
            <span>{formatPercent(item.changePercent)}</span>
          </span>
        ) : (
          NO_VALUE
        )
      }
      valueClass={item ? getChangeColor(item.changePercent) : "text-muted-foreground"}
      sub={
        item ? (
          <span className="block truncate">
            {item.symbol}
            {item.shortName ? ` · ${item.shortName}` : ""}
          </span>
        ) : (
          moverSub
        )
      }
      className={item ? "cursor-pointer transition-colors hover:border-border-strong" : undefined}
      role={item ? "button" : undefined}
      tabIndex={item ? 0 : undefined}
      onClick={item ? () => onSelectSymbol(item.symbol) : undefined}
      onKeyDown={
        item
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectSymbol(item.symbol);
              }
            }
          : undefined
      }
    />
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Market"
        value={market ? (market.open ? "Open" : "Closed") : NO_VALUE}
        sub={market ? market.label : NO_SUB}
      />
      {moverTile("Watchlist gainer", gainer)}
      {moverTile("Watchlist loser", loser)}
      <StatCard
        label="Alerts"
        value={alertCount > 0 ? alertCount : "None"}
        valueClass={alertCount > 0 ? "text-warning" : "text-muted-foreground"}
        sub={alertSub}
        className="cursor-pointer transition-colors hover:border-border-strong"
        role="button"
        tabIndex={0}
        onClick={onOpenAlerts}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenAlerts();
          }
        }}
      />
    </div>
  );
}
