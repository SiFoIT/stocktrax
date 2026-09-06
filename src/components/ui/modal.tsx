"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open?: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Secondary line under the title. */
  subtitle?: React.ReactNode;
  /** Extra controls in the header, left of the close button. */
  headerRight?: React.ReactNode;
  maxWidth?: string;
  /** Vertically centre instead of anchoring to the top. */
  center?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared modal chrome: overlay, surface, close button, Escape handling and
 * body scroll lock. Replaces the six hand-rolled `fixed inset-0` containers.
 */
export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  headerRight,
  maxWidth = "max-w-4xl",
  center = false,
  className,
  bodyClassName,
  children,
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 px-4 py-6",
        center ? "items-center" : "items-start"
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn("w-full rounded-lg border border-border bg-card shadow-xl", maxWidth, className)}
        onClick={(e) => e.stopPropagation()}
      >
        {(title !== undefined || headerRight !== undefined) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4">
            <div className="min-w-0">
              {title !== undefined && (
                <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h2>
              )}
              {subtitle !== undefined && subtitle !== null && subtitle !== "" && (
                <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {headerRight}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}
        <div className={cn("px-5 pb-5", title !== undefined ? "pt-4" : "pt-5", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
