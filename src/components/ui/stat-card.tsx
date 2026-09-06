import * as React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps extends Omit<React.ComponentProps<"div">, "title"> {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Colour for the value line, e.g. getChangeColor(delta). */
  valueClass?: string;
  /** Colour for the sub line; defaults to muted. */
  subClass?: string;
  size?: "sm" | "md";
}

/**
 * The single stat tile used by the dashboard, the portfolio page and the
 * period-return row. Forwards ref/props so it can be a Radix PopoverTrigger.
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(function StatCard(
  { label, value, sub, valueClass, subClass, size = "md", className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn("min-w-0 rounded-lg border border-border bg-card px-3.5 py-3", className)}
      {...props}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "break-words font-semibold tracking-tight",
          size === "sm" ? "text-base" : "text-lg sm:text-xl",
          valueClass
        )}
      >
        {value}
      </div>
      {sub !== undefined && sub !== null && sub !== "" && (
        <div className={cn("mt-0.5 text-xs", subClass ?? "text-muted-foreground")}>{sub}</div>
      )}
    </div>
  );
});
