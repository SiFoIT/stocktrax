import { getSetting, setSetting } from "@/lib/settings";

/**
 * What the performance chart compares the account against.
 *
 * Presets are listed ETFs rather than indexes: an index level leaves out
 * dividends, and an account receives them, so a price index would flatter
 * the account by the index's yield every year. All presets trade in CAD.
 * Any other symbol can be added; a USD one is converted at each day's rate.
 */
export interface Benchmark {
  symbol: string;
  label: string;
  description?: string;
  preset: boolean;
}

export const BENCHMARK_PRESETS: Omit<Benchmark, "preset">[] = [
  { symbol: "XEQT.TO", label: "XEQT", description: "All-equity global portfolio (iShares XEQT)" },
  { symbol: "XIC.TO", label: "TSX", description: "S&P/TSX Capped Composite (iShares XIC)" },
  { symbol: "VFV.TO", label: "S&P 500", description: "S&P 500 in Canadian dollars (Vanguard VFV)" },
  { symbol: "XBAL.TO", label: "60/40", description: "Balanced 60% stocks / 40% bonds (iShares XBAL)" },
];

export const DEFAULT_BENCHMARKS = ["XEQT.TO", "XIC.TO"];
export const MAX_BENCHMARKS = 6;
export const BENCHMARKS_SETTING = "performance.benchmarks";

/** A custom symbol's short label: the ticker without its exchange suffix. */
export function benchmarkLabel(symbol: string): string {
  const preset = BENCHMARK_PRESETS.find((p) => p.symbol === symbol);
  return preset ? preset.label : symbol.replace(/\.(TO|V|NE|CN)$/i, "");
}

export function toBenchmark(symbol: string): Benchmark {
  const preset = BENCHMARK_PRESETS.find((p) => p.symbol === symbol);
  return preset ? { ...preset, preset: true } : { symbol, label: benchmarkLabel(symbol), preset: false };
}

/** The chosen benchmarks, in the user's order. */
export async function getBenchmarks(): Promise<Benchmark[]> {
  const stored = await getSetting<string[] | null>(BENCHMARKS_SETTING, null);
  const symbols = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_BENCHMARKS;
  return symbols.slice(0, MAX_BENCHMARKS).map(toBenchmark);
}

export async function setBenchmarks(symbols: string[]): Promise<void> {
  await setSetting(BENCHMARKS_SETTING, symbols);
}
