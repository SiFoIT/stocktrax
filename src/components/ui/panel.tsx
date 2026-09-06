"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
      {...props}
    />
  );
}

export interface PanelTab<T extends string = string> {
  key: T;
  label: string;
}

interface PanelHeaderProps<T extends string> {
  title?: React.ReactNode;
  /** Secondary text after the title, e.g. "20 positions". */
  meta?: React.ReactNode;
  tabs?: readonly PanelTab<T>[];
  activeTab?: T;
  onTabChange?: (key: T) => void;
  /** Right-aligned slot: updated label, refresh button, forms. */
  right?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Panel chrome: title + underline tabs + a right slot, all on one 44px row.
 * Below `md` the row wraps instead of overflowing.
 */
export function PanelHeader<T extends string>({
  title,
  meta,
  tabs,
  activeTab,
  onTabChange,
  right,
  className,
  children,
}: PanelHeaderProps<T>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-2 md:h-11 md:flex-nowrap md:py-0",
        className
      )}
    >
      {title !== undefined && (
        <div className="whitespace-nowrap text-sm font-semibold text-foreground">
          {title}
          {meta !== undefined && meta !== null && meta !== "" && (
            <span className="ml-1.5 font-normal text-subtle-foreground">{meta}</span>
          )}
        </div>
      )}
      {tabs && tabs.length > 0 && (
        <PanelTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      )}
      {children}
      {right !== undefined && (
        <div className="ml-auto flex items-center gap-3 whitespace-nowrap text-xs text-subtle-foreground">{right}</div>
      )}
    </div>
  );
}

export function PanelTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className,
}: {
  tabs: readonly PanelTab<T>[];
  activeTab?: T;
  onTabChange?: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("-mb-px flex h-11 gap-0.5 overflow-x-auto", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange?.(tab.key)}
          data-active={activeTab === tab.key}
          className="flex shrink-0 items-center border-b-2 border-transparent px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Content well. Tables go edge-to-edge, so padding is opt-in. */
export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(className)} {...props} />;
}
