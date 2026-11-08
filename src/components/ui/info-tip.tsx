"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Info } from "lucide-react";
import { createPortal } from "react-dom";

const isTouch = () => window.matchMedia("(hover: none)").matches;

export function InfoTip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipWidth = 192; // w-48
    let left = rect.left + rect.width / 2 - tipWidth / 2;
    // Clamp to viewport edges with 8px gutter
    left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));
    setPos({ top: rect.bottom + 6, left });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  // Touch screens have no hover, so a tap toggles the tip instead. Mouse users
  // keep the hover behaviour unchanged.
  const toggle = useCallback(
    (e: React.MouseEvent) => {
      if (!isTouch()) return;
      e.stopPropagation();
      if (pos) hide();
      else show();
    },
    [pos, show, hide]
  );

  // A tip opened by tap closes on the next tap elsewhere or on scroll, since
  // there is no mouseleave to do it.
  useEffect(() => {
    if (!pos || !isTouch()) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      hide();
    };
    document.addEventListener("click", close, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("click", close, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, [pos, hide]);

  return (
    <span
      ref={ref}
      className="inline-flex ml-1 align-middle"
      // iOS fires mouseenter on tap just before click; ignore it there so the
      // tap toggle is not cancelled out.
      onMouseEnter={() => !isTouch() && show()}
      onMouseLeave={() => !isTouch() && hide()}
      onClick={toggle}
    >
      <Info className="size-3.5 text-subtle-foreground hover:text-foreground transition-colors cursor-help" />
      {pos &&
        createPortal(
          <div
            className="fixed z-[9999] w-48 rounded-lg bg-popover border border-border px-3 py-2 text-xs text-muted-foreground leading-relaxed text-left font-normal normal-case tracking-normal pointer-events-none"
            style={{ top: pos.top, left: pos.left }}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
