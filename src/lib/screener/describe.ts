import { METRICS, type ScreenOperator, type ScreenRule } from "./metrics";

/** Operator glyphs for prose. `between` is handled separately. */
const OPERATOR_GLYPH: Record<ScreenOperator, string> = {
  gte: "≥",
  lte: "≤",
  gt: ">",
  lt: "<",
  between: "between",
};

/**
 * A threshold as the user typed it, not as a measurement.
 * `formatMetricValue` pads to two decimals and signs directional metrics,
 * which reads wrong in a rule summary: the rule says "≥ 20%", not "≥ +20.00%".
 */
export function formatThreshold(value: number, metricKey: string): string {
  const unit = METRICS[metricKey]?.unit ?? "";
  const trimmed = trimNumber(value);
  if (unit === "$B") {
    if (Math.abs(value) < 1) return `$${trimNumber(value * 1000)}M`;
    return `$${trimmed}B`;
  }
  if (unit === "%") return `${trimmed}%`;
  if (unit === "x") return `${trimmed}x`;
  return trimmed;
}

/** Up to two decimals, with no trailing zeros: 20 → "20", 2.5 → "2.5". */
function trimNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

/** "Below 52-Week High ≥ 20%", "Trailing P/E between 0x and 15x". */
export function describeRule(rule: ScreenRule): string {
  // An unknown key means a rule this build cannot render. Show the raw key
  // rather than hiding the rule.
  const label = METRICS[rule.metric]?.label ?? rule.metric;
  if (rule.operator === "between") {
    const from = formatThreshold(rule.value, rule.metric);
    const to = formatThreshold(rule.valueTo ?? rule.value, rule.metric);
    return `${label} between ${from} and ${to}`;
  }
  const glyph = OPERATOR_GLYPH[rule.operator] ?? String(rule.operator);
  return `${label} ${glyph} ${formatThreshold(rule.value, rule.metric)}`;
}

/** Every rule joined by the match mode, e.g. "A ≥ 1 and B ≤ 2". */
export function describeScreen(rules: ScreenRule[], match: "all" | "any"): string {
  if (rules.length === 0) return "No rules yet";
  return rules.map(describeRule).join(match === "all" ? " and " : " or ");
}

interface NamedList {
  id: number;
  name: string;
}

/** "All symbols", "Watchlist: Canadian Banks", "Portfolio: TFSA". */
export function describeSource(
  source: string,
  watchlists: NamedList[],
  portfolios: NamedList[]
): string {
  if (source.startsWith("watchlist:")) {
    const id = parseInt(source.slice("watchlist:".length), 10);
    const found = watchlists.find((w) => w.id === id);
    return found ? `Watchlist: ${found.name}` : "Watchlist (deleted)";
  }
  if (source.startsWith("portfolio:")) {
    const id = parseInt(source.slice("portfolio:".length), 10);
    const found = portfolios.find((p) => p.id === id);
    return found ? `Portfolio: ${found.name}` : "Portfolio (deleted)";
  }
  return "All symbols";
}

/**
 * "Never run" / "Just now" / "12 min ago" / "3 h ago" / "Yesterday" /
 * "Sep 2" / "Sep 2, 2025". `now` is a parameter so this is testable.
 */
export function formatLastRun(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "Never run";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Never run";

  const diffMs = now.getTime() - then.getTime();
  // A clock skew or a freshly written timestamp can land slightly ahead.
  if (diffMs < 60_000) return "Just now";

  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} h ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000);
  if (diffDays === 1) return "Yesterday";

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "Foo" → "Foo copy" → "Foo copy 2", skipping names already taken. */
export function nextCopyName(name: string, existing: string[]): string {
  const taken = new Set(existing);
  // Copying a copy extends the original stem rather than nesting "copy copy".
  const stem = name.replace(/ copy(?: \d+)?$/, "");
  const first = `${stem} copy`;
  if (!taken.has(first)) return first;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${first} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${first} ${Date.now()}`;
}
