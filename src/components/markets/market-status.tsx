"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { formatUpdatedTime } from "@/lib/utils";

interface MarketStatusProps {
  onRefresh: () => void;
  isLoading: boolean;
  updatedAt?: Date | null;
}

export function MarketStatus({ onRefresh, isLoading, updatedAt }: MarketStatusProps) {
  return (
    <div className="flex items-center gap-4">
      {updatedAt && (
        <span className="text-xs text-muted-foreground">
          {formatUpdatedTime(updatedAt)}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
        className="bg-muted border-border hover:bg-accent"
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
