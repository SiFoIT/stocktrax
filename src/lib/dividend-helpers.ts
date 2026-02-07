export function formatPercentRaw(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${value.toFixed(2)}%`;
}

export function getDaysToExDiv(exDividendDate: string | undefined): number | undefined {
  if (!exDividendDate) return undefined;
  const exDate = new Date(exDividendDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exDate.setHours(0, 0, 0, 0);
  const diffTime = exDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function formatDaysToExDiv(days: number | undefined): string {
  if (days === undefined) return "-";
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  return `${days}d`;
}

export function getDaysToExDivColor(days: number | undefined): string {
  if (days === undefined) return "text-black/50 dark:text-white/50";
  if (days < 0) return "text-black/40 dark:text-white/40";
  if (days <= 7) return "text-amber-400";
  if (days <= 30) return "text-emerald-400";
  return "text-black/70 dark:text-white/70";
}

export function getSafetyLabel(payoutRatio: number | undefined): { text: string; color: string; bg: string } {
  if (payoutRatio === undefined) return { text: "-", color: "text-black/50 dark:text-white/50", bg: "" };
  if (payoutRatio < 0.5) return { text: "Safe", color: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (payoutRatio < 0.8) return { text: "Moderate", color: "text-amber-400", bg: "bg-amber-500/10" };
  return { text: "At Risk", color: "text-red-400", bg: "bg-red-500/10" };
}

export function getSectorAbbrev(sector: string | undefined): string {
  if (!sector) return "-";
  const abbrevMap: Record<string, string> = {
    "Technology": "Tech",
    "Financial Services": "Finance",
    "Healthcare": "Health",
    "Consumer Cyclical": "Cons Cyc",
    "Consumer Defensive": "Cons Def",
    "Communication Services": "Comms",
    "Industrials": "Indust",
    "Real Estate": "REIT",
    "Basic Materials": "Materials",
    "Energy": "Energy",
    "Utilities": "Utilities",
  };
  return abbrevMap[sector] || sector.slice(0, 8);
}
