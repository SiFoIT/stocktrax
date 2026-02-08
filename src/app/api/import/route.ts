import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  portfolios,
  holdings,
  transactions,
  cashTransactions,
  watchlists,
  watchlistItems,
} from "@/lib/db/schema";
import { z } from "zod";
import { BACKUP_VERSION } from "@/lib/backup/settings-registry";
import { recomputeHolding } from "@/lib/holdings";

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
      type: z.enum(["contribution", "deposit", "refund", "referral", "transfer_in", "transfer_out"]),
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
  }),
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

    // Wrap entire delete + insert + recompute in a transaction
    // so a failure mid-import rolls back all changes
    db.transaction((tx) => {
      // Delete all existing data (order matters for foreign keys)
      tx.delete(transactions).run();
      tx.delete(holdings).run();
      tx.delete(cashTransactions).run();
      tx.delete(portfolios).run();
      tx.delete(watchlistItems).run();
      tx.delete(watchlists).run();

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

    return NextResponse.json({
      success: true,
      imported: {
        portfolios: backup.data.portfolios.length,
        holdings: backup.data.holdings.length,
        transactions: backup.data.transactions.length,
        cashTransactions: backup.data.cashTransactions?.length || 0,
        watchlists: backup.data.watchlists.length,
        watchlistItems: backup.data.watchlistItems.length,
      },
      settings: backup.settings,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
}
