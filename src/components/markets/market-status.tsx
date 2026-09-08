"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { formatUpdatedTime } from "@/lib/utils";
import { MARKET_RANGES, MarketRange } from "@/lib/markets/ranges";

interface MarketStatusProps {
  range: MarketRange;
  onRangeChange: (range: MarketRange) => void;
  onRefresh: () => void;
  isLoading: boolean;
  updatedAt?: Date | null;
}

/**
 * The right side of the Markets panel header: the timeframe every sparkline,
 * change and percent on the page is measured over, the last refresh time, and
 * the Refresh button.
 */
export function MarketStatus({ range, onRangeChange, onRefresh, isLoading, updatedAt }: MarketStatusProps) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {/* A view toggle, not a status, so it stays neutral like the chart's own range pills. */}
      <div
        role="radiogroup"
        aria-label="Timeframe"
        className="inline-flex rounded-md border border-border bg-muted p-0.5"
      >
        {MARKET_RANGES.map((option) => {
          const active = option === range;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onRangeChange(option)}
              className={`rounded px-2 py-0.5 font-mono text-xs font-medium transition-colors ${
                active
                  ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
      {updatedAt && (
        <span className="hidden text-xs text-muted-foreground md:inline">
          {formatUpdatedTime(updatedAt)}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        className="bg-muted border-border hover:bg-accent"
        title={updatedAt ? formatUpdatedTime(updatedAt) : undefined}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-border-strong border-t-foreground rounded-full animate-spin" />
            Refreshing...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4" />
            Refresh
          </div>
        )}
      </Button>
    </div>
  );
}
