import { useState, useEffect } from "react";
import { formatUpdatedTime } from "@/lib/utils";

export function useRelativeTime(date: Date | null): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [date]);

  return date ? formatUpdatedTime(date) : null;
}
