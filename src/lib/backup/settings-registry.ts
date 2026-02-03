// Registry of localStorage keys to include in backup
// Add new settings here when implementing new features

export type SettingEntry =
  | { key: string; default: string | null }
  | { key: RegExp; type: "pattern" };

export const BACKUP_SETTINGS: SettingEntry[] = [
  { key: "theme", default: "dark" },
  { key: "stocktrax_default_tab", default: "general" },
  { key: /^chart_prefs_/, type: "pattern" }, // Matches chart_prefs_*
];

// Tables to exclude from backup (cache tables, not user data)
export const EXCLUDED_TABLES = ["stockCache"] as const;

// Export format version - increment when making breaking changes
export const BACKUP_VERSION = "1.0";

export interface BackupData {
  version: string;
  exportedAt: string;
  data: {
    portfolios: unknown[];
    holdings: unknown[];
    transactions: unknown[];
    watchlists: unknown[];
    watchlistItems: unknown[];
  };
  settings: {
    theme: string | null;
    defaultTab: string | null;
    chartPreferences: Record<string, unknown>;
  };
}

/**
 * Collect all localStorage settings that match the registry
 */
export function collectSettings(): BackupData["settings"] {
  if (typeof window === "undefined") {
    return { theme: null, defaultTab: null, chartPreferences: {} };
  }

  const theme = localStorage.getItem("theme");
  const defaultTab = localStorage.getItem("stocktrax_default_tab");
  const chartPreferences: Record<string, unknown> = {};

  // Collect all chart_prefs_* keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("chart_prefs_")) {
      try {
        chartPreferences[key] = JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        chartPreferences[key] = localStorage.getItem(key);
      }
    }
  }

  return { theme, defaultTab, chartPreferences };
}

/**
 * Restore settings from backup to localStorage
 */
export function restoreSettings(settings: BackupData["settings"]): void {
  if (typeof window === "undefined") return;

  if (settings.theme) {
    localStorage.setItem("theme", settings.theme);
  }
  if (settings.defaultTab) {
    localStorage.setItem("stocktrax_default_tab", settings.defaultTab);
  }
  if (settings.chartPreferences) {
    for (const [key, value] of Object.entries(settings.chartPreferences)) {
      localStorage.setItem(
        key,
        typeof value === "string" ? value : JSON.stringify(value)
      );
    }
  }
}
