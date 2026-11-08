"use client";

import { useEffect } from "react";

/**
 * Stops the page behind an overlay from scrolling while `active`.
 *
 * `touchOnly` limits the lock to touch screens, for overlays that never
 * locked on desktop and should keep behaving that way there.
 */
export function useBodyScrollLock(active = true, { touchOnly = false }: { touchOnly?: boolean } = {}) {
  useEffect(() => {
    if (!active) return;
    if (touchOnly && !window.matchMedia("(hover: none)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active, touchOnly]);
}
