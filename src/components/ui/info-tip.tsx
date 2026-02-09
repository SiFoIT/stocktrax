"use client";

import { useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

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

  return (
    <span
      ref={ref}
      className="inline-flex ml-1 align-middle"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <svg className="w-3.5 h-3.5 text-black/30 dark:text-white/30 hover:text-black/60 dark:hover:text-white/60 transition-colors cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {pos &&
        createPortal(
          <div
            className="fixed z-[9999] w-48 rounded-lg bg-zinc-800 border border-white/10 px-3 py-2 text-xs text-white/80 leading-relaxed shadow-xl text-left font-normal normal-case tracking-normal pointer-events-none"
            style={{ top: pos.top, left: pos.left }}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
