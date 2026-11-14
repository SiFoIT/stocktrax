import { db } from "@/lib/db";
import {
  portfolios,
  holdings,
  transactions,
  cashTransactions,
  watchlists,
  watchlistItems,
  portfolioSnapshots,
  alertRules,
  alerts,
  screens,
  screenPresets,
  settings as settingsTable,
} from "@/lib/db/schema";
import {
  BACKUP_VERSION,
  BackupData,
  EXCLUDED_SETTING_KEYS,
} from "@/lib/backup/settings-registry";

/**
 * Run-state keys written by the scheduled backup itself. Like the digest's
 * last-sent markers they describe this deployment, not a preference, so a
 * restore must not carry them to another one.
 */
export const BACKUP_RUN_STATE_KEYS = ["backup.lastScheduled", "backup.lastManual"] as const;

export interface BuildBackupOptions {
  /** Browser-side preferences (theme, default tab, chart prefs) to embed. */
  clientSettings?: BackupData["settings"];
  now?: Date;
}

const EMPTY_CLIENT_SETTINGS: BackupData["settings"] = {
  theme: null,
  defaultTab: null,
  chartPreferences: {},
};

/**
 * The full JSON backup: every user-data table plus server settings, with the
 * SMTP password and per-deployment run state removed. Shared by the export
 * route and the scheduled backup so both write the same format.
 */
export async function buildBackup(options: BuildBackupOptions = {}): Promise<BackupData> {
  const now = options.now ?? new Date();

  const [
    portfoliosData,
    holdingsData,
    transactionsData,
    cashTransactionsData,
    watchlistsData,
    watchlistItemsData,
    snapshotsData,
    alertRulesData,
    alertsData,
    screensData,
    screenPresetsData,
    serverSettingsData,
  ] = await Promise.all([
    db.select().from(portfolios),
    db.select().from(holdings),
    db.select().from(transactions),
    db.select().from(cashTransactions),
    db.select().from(watchlists),
    db.select().from(watchlistItems),
    db.select().from(portfolioSnapshots),
    db.select().from(alertRules),
    db.select().from(alerts),
    db.select().from(screens),
    db.select().from(screenPresets),
    db.select().from(settingsTable),
  ]);

  const excluded = new Set<string>([...EXCLUDED_SETTING_KEYS, ...BACKUP_RUN_STATE_KEYS]);

  return {
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      portfolios: portfoliosData,
      holdings: holdingsData,
      transactions: transactionsData,
      cashTransactions: cashTransactionsData,
      watchlists: watchlistsData,
      watchlistItems: watchlistItemsData,
      portfolioSnapshots: snapshotsData,
      alertRules: alertRulesData,
      alerts: alertsData,
      screens: screensData,
      screenPresets: screenPresetsData,
    },
    settings: options.clientSettings ?? EMPTY_CLIENT_SETTINGS,
    serverSettings: serverSettingsData
      .filter((row) => !excluded.has(row.key))
      .map((row) => ({ key: row.key, value: row.value })),
  };
}

/** `stocktrax-backup-YYYY-MM-DD.json`, dated in UTC as the export always has been. */
export function backupFilename(now: Date = new Date()): string {
  return `stocktrax-backup-${now.toISOString().split("T")[0]}.json`;
}
