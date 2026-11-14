import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invalidatePortfolioSummary } from "@/lib/portfolio-summary";
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
import { like } from "drizzle-orm";
import { z } from "zod";
import { BACKUP_VERSION } from "@/lib/backup/settings-registry";
import {
  PORTFOLIO_SCOPED_SETTING_PREFIXES,
  restorableAlertRules,
  restorableSettings,
} from "@/lib/backup/restore";
import { recomputeHolding } from "@/lib/holdings";
import {
  alertMetrics,
  alertOperators,
  alertResetStrategies,
  alertScopes,
} from "@/lib/alerts/config";

const dateValue = z.union([z.string(), z.date(), z.number()]);
const nullableDate = dateValue.nullable().optional();

// Schema for validating import data
const backupSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  data: z.object({
    portfolios: z.array(z.object({
      id: z.number(),
      name: z.string(),
      currency: z.enum(["USD", "CAD"]),
      createdAt: z.union([z.string(), z.date(), z.number()]),
    })),
    holdings: z.array(z.object({
      id: z.number(),
      portfolioId: z.number(),
      symbol: z.string(),
      shares: z.number(),
      avgCost: z.number(),
      currency: z.string(),
    })),
    transactions: z.array(z.object({
      id: z.number(),
      holdingId: z.number(),
      type: z.enum(["buy", "sell", "dividend", "transfer_in"]),
      shares: z.number(),
      price: z.number(),
      date: z.union([z.string(), z.date(), z.number()]),
    })),
    cashTransactions: z.array(z.object({
      id: z.number(),
      portfolioId: z.number(),
      type: z.enum(["contribution", "deposit", "refund", "referral", "transfer_in", "transfer_out", "fx_conversion"]),
      description: z.string(),
      amount: z.number(),
      currency: z.string(),
      date: z.union([z.string(), z.date(), z.number()]),
    })).optional().default([]),
    watchlists: z.array(z.object({
      id: z.number(),
      name: z.string(),
      createdAt: z.union([z.string(), z.date(), z.number()]),
    })),
    watchlistItems: z.array(z.object({
      id: z.number(),
      watchlistId: z.number(),
      symbol: z.string(),
      addedAt: z.union([z.string(), z.date(), z.number()]),
    })),
    portfolioSnapshots: z.array(z.object({
      id: z.number(),
      portfolioId: z.number(),
      date: z.string(),
      marketValue: z.number(),
      costBasis: z.number(),
      dayChange: z.number(),
      currency: z.string(),
      createdAt: z.union([z.string(), z.date(), z.number()]),
    })).optional().default([]),
    // Absent from backups made before 1.1: those tables are then left alone.
    alertRules: z.array(z.object({
      id: z.number(),
      scope: z.enum(alertScopes),
      watchlistItemId: z.number().nullable(),
      holdingId: z.number().nullable(),
      symbol: z.string(),
      metric: z.enum(alertMetrics),
      operator: z.enum(alertOperators),
      threshold: z.number(),
      resetStrategy: z.enum(alertResetStrategies),
      anchorValue: z.number().nullable().optional(),
      cooldownMinutes: z.number().nullable().optional(),
      baselineValue: z.number().nullable().optional(),
      needsRecovery: z.boolean().optional().default(false),
      isMuted: z.boolean().optional().default(false),
      cooldownUntil: nullableDate,
      lastTriggeredAt: nullableDate,
      lastResetAt: nullableDate,
      createdAt: dateValue,
      updatedAt: dateValue,
    })).optional(),
    alerts: z.array(z.object({
      id: z.number(),
      ruleId: z.number(),
      scope: z.enum(alertScopes),
      symbol: z.string(),
      message: z.string(),
      metricValue: z.number().nullable().optional(),
      price: z.number().nullable().optional(),
      changePercent: z.number().nullable().optional(),
      triggeredAt: dateValue,
      acknowledgedAt: nullableDate,
      resetStrategy: z.enum(alertResetStrategies),
      operator: z.enum(alertOperators),
      threshold: z.number(),
    })).optional(),
    screens: z.array(z.object({
      id: z.number(),
      name: z.string(),
      source: z.string(),
      rules: z.string(),
      match: z.enum(["all", "any"]),
      createdAt: dateValue,
      updatedAt: dateValue,
      lastRunAt: nullableDate,
      lastMatchCount: z.number().nullable().optional(),
      lastTotalScanned: z.number().nullable().optional(),
    })).optional(),
    screenPresets: z.array(z.object({
      id: z.number(),
      name: z.string(),
      rules: z.string(),
      match: z.enum(["all", "any"]),
      createdAt: dateValue,
    })).optional(),
  }),
  serverSettings: z.array(z.object({
    key: z.string(),
    value: z.string(),
  })).optional().default([]),
  settings: z.object({
    theme: z.string().nullable(),
    defaultTab: z.string().nullable(),
    chartPreferences: z.record(z.string(), z.unknown()),
  }).optional(),
});

type BackupInput = z.infer<typeof backupSchema>;

function parseDate(value: string | Date | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(value);
}

function parseOptionalDate(value: string | Date | number | null | undefined): Date | null {
  return value === null || value === undefined ? null : parseDate(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate the backup structure
    const parsed = backupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid backup format", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const backup: BackupInput = parsed.data;

    // Check version compatibility
    const [major] = backup.version.split(".");
    const [currentMajor] = BACKUP_VERSION.split(".");
    if (major !== currentMajor) {
      return NextResponse.json(
        { error: `Incompatible backup version. Expected ${BACKUP_VERSION}, got ${backup.version}` },
        { status: 400 }
      );
    }

    const data = backup.data;
    let alertRulesDropped = 0;

    // Wrap entire delete + insert + recompute in a transaction
    // so a failure mid-import rolls back all changes
    db.transaction((tx) => {
      // Alert rules hang off holdings and watchlist items with ON DELETE
      // CASCADE, so deleting those below wipes every non-market rule and its
      // history. A backup that predates alert export restores the rules that
      // were here; a newer one replaces them with its own.
      const ruleSource = data.alertRules
        ? data.alertRules.map((r) => ({
            ...r,
            anchorValue: r.anchorValue ?? null,
            cooldownMinutes: r.cooldownMinutes ?? 60,
            baselineValue: r.baselineValue ?? null,
            cooldownUntil: parseOptionalDate(r.cooldownUntil),
            lastTriggeredAt: parseOptionalDate(r.lastTriggeredAt),
            lastResetAt: parseOptionalDate(r.lastResetAt),
            createdAt: parseDate(r.createdAt),
            updatedAt: parseDate(r.updatedAt),
          }))
        : tx.select().from(alertRules).all();
      const alertSource = data.alertRules
        ? (data.alerts ?? []).map((a) => ({
            ...a,
            metricValue: a.metricValue ?? null,
            price: a.price ?? null,
            changePercent: a.changePercent ?? null,
            triggeredAt: parseDate(a.triggeredAt),
            acknowledgedAt: parseOptionalDate(a.acknowledgedAt),
          }))
        : tx.select().from(alerts).all();

      // Delete all existing data (order matters for foreign keys)
      tx.delete(alerts).run();
      tx.delete(alertRules).run();
      tx.delete(transactions).run();
      tx.delete(portfolioSnapshots).run();
      tx.delete(holdings).run();
      tx.delete(cashTransactions).run();
      tx.delete(portfolios).run();
      tx.delete(watchlistItems).run();
      tx.delete(watchlists).run();
      if (data.screens) tx.delete(screens).run();
      if (data.screenPresets) tx.delete(screenPresets).run();

      // Insert new data (order matters for foreign keys)
      for (const p of backup.data.portfolios) {
        tx.insert(portfolios).values({
          id: p.id,
          name: p.name,
          currency: p.currency,
          createdAt: parseDate(p.createdAt),
        }).run();
      }

      for (const h of backup.data.holdings) {
        tx.insert(holdings).values({
          id: h.id,
          portfolioId: h.portfolioId,
          symbol: h.symbol,
          shares: h.shares,
          avgCost: h.avgCost,
          currency: h.currency,
        }).run();
      }

      for (const t of backup.data.transactions) {
        tx.insert(transactions).values({
          id: t.id,
          holdingId: t.holdingId,
          type: t.type,
          shares: t.shares,
          price: t.price,
          date: parseDate(t.date),
        }).run();
      }

      for (const w of backup.data.watchlists) {
        tx.insert(watchlists).values({
          id: w.id,
          name: w.name,
          createdAt: parseDate(w.createdAt),
        }).run();
      }

      for (const item of backup.data.watchlistItems) {
        tx.insert(watchlistItems).values({
          id: item.id,
          watchlistId: item.watchlistId,
          symbol: item.symbol,
          addedAt: parseDate(item.addedAt),
        }).run();
      }

      for (const snap of backup.data.portfolioSnapshots) {
        tx.insert(portfolioSnapshots).values({
          id: snap.id,
          portfolioId: snap.portfolioId,
          date: snap.date,
          marketValue: snap.marketValue,
          costBasis: snap.costBasis,
          dayChange: snap.dayChange,
          currency: snap.currency,
          createdAt: parseDate(snap.createdAt),
        }).run();
      }

      // Alert rules last among the keyed rows: they reference holdings and
      // watchlist items. A rule whose target is gone (or now a different
      // symbol) is dropped rather than failing the restore.
      const { kept, dropped } = restorableAlertRules(
        ruleSource,
        new Map(data.holdings.map((h) => [h.id, h.symbol])),
        new Map(data.watchlistItems.map((i) => [i.id, i.symbol]))
      );
      alertRulesDropped = dropped.length;
      for (const rule of kept) {
        tx.insert(alertRules).values(rule).run();
      }
      const keptRuleIds = new Set(kept.map((r) => r.id));
      for (const alert of alertSource) {
        if (keptRuleIds.has(alert.ruleId)) tx.insert(alerts).values(alert).run();
      }

      for (const screen of data.screens ?? []) {
        tx.insert(screens).values({
          ...screen,
          createdAt: parseDate(screen.createdAt),
          updatedAt: parseDate(screen.updatedAt),
          lastRunAt: parseOptionalDate(screen.lastRunAt),
          lastMatchCount: screen.lastMatchCount ?? null,
          lastTotalScanned: screen.lastTotalScanned ?? null,
        }).run();
      }
      for (const preset of data.screenPresets ?? []) {
        tx.insert(screenPresets).values({
          ...preset,
          createdAt: parseDate(preset.createdAt),
        }).run();
      }

      // Keys tied to a portfolio id describe the portfolios being replaced, so
      // they go; the backup's own are written back below for its portfolios.
      for (const prefix of PORTFOLIO_SCOPED_SETTING_PREFIXES) {
        tx.delete(settingsTable).where(like(settingsTable.key, `${prefix}%`)).run();
      }

      // Server settings merge rather than replace: the SMTP password is never
      // in a backup, so wiping the table would silently break sending.
      const portfolioIds = new Set(data.portfolios.map((p) => p.id));
      for (const setting of restorableSettings(backup.serverSettings, portfolioIds)) {
        tx.insert(settingsTable).values({
          key: setting.key,
          value: setting.value,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: setting.value, updatedAt: new Date() },
        }).run();
      }

      for (const ct of backup.data.cashTransactions) {
        tx.insert(cashTransactions).values({
          id: ct.id,
          portfolioId: ct.portfolioId,
          type: ct.type,
          description: ct.description,
          amount: ct.amount,
          currency: ct.currency,
          date: parseDate(ct.date),
        }).run();
      }

      // Recompute all holdings from their transactions
      for (const h of backup.data.holdings) {
        recomputeHolding(h.id, tx);
      }
    });

    // A restore replaces everything the cached dashboard lists.
    await invalidatePortfolioSummary();

    return NextResponse.json({
      success: true,
      imported: {
        portfolios: backup.data.portfolios.length,
        holdings: backup.data.holdings.length,
        transactions: backup.data.transactions.length,
        cashTransactions: backup.data.cashTransactions?.length || 0,
        watchlists: backup.data.watchlists.length,
        watchlistItems: backup.data.watchlistItems.length,
        alertRules: data.alertRules ? data.alertRules.length - alertRulesDropped : null,
        screens: data.screens?.length ?? null,
        screenPresets: data.screenPresets?.length ?? null,
      },
      alertRulesDropped,
      settings: backup.settings,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
}
