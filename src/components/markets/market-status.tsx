"use client";

import { Button } from "@/components/ui/button";

interface MarketStatusProps {
  onRefresh: () => void;
  isLoading: boolean;
  updatedAt?: Date | null;
}

function formatUpdatedTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return "Updated just now";
  } else if (diffMins < 60) {
    return `Updated ${diffMins} min ago`;
  } else {
    return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
}

function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;

  // Weekend check (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) {
    return false;
  }

  // US market hours: 9:30 AM - 4:00 PM ET
  // This is a simplified check - doesn't account for holidays or user timezone
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM

  return time >= marketOpen && time < marketClose;
}

export function MarketStatusIndicator() {
  const open = isMarketOpen();

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          open ? "bg-green-500 animate-pulse" : "bg-red-500"
        }`}
      />
      <span className="text-sm text-black/70 dark:text-white/70">
        Markets {open ? "open" : "closed"}
      </span>
    </div>
  );
}

export function MarketStatus({ onRefresh, isLoading, updatedAt }: MarketStatusProps) {
  return (
    <div className="flex items-center gap-4">
      {updatedAt && (
        <span className="text-xs text-black/50 dark:text-white/50">
          {formatUpdatedTime(updatedAt)}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10"
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-black/30 dark:border-white/30 border-t-black dark:border-t-white rounded-full animate-spin" />
            Refreshing...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </div>
        )}
      </Button>
    </div>
  );
}
