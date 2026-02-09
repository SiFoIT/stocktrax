import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { recomputeHolding } from "@/lib/holdings";
import { stockTxnDedupKey, cashTxnDedupKey } from "@/lib/import/wealthsimple-parser";

const stockTransactionSchema = z.object({
  type: z.enum(["buy", "sell", "dividend", "transfer_in"]),
  symbol: z.string().min(1),
  shares: z.number().positive(),
  price: z.number().min(0),
  date: z.string(),
  currency: z.string(),
});

const cashTransactionSchema = z.object({
  type: z.enum(["contribution", "deposit", "refund", "referral", "transfer_in", "transfer_out"]),
  description: z.string(),
  amount: z.number(),
  date: z.string(),
  currency: z.string(),
});

const importSchema = z.object({
  portfolioId: z.number(),
  stockTransactions: z.array(stockTransactionSchema),
  cashTransactions: z.array(cashTransactionSchema),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = importSchema.parse(body);

    // Verify portfolio exists
    const portfolio = await db.query.portfolios.findFirst({
      where: eq(schema.portfolios.id, validated.portfolioId),
    });
    if (!portfolio) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    // Fetch existing holdings for this portfolio
    const existingHoldings = await db.query.holdings.findMany({
      where: eq(schema.holdings.portfolioId, validated.portfolioId),
    });

    // Build dedup set from existing stock transactions
    const holdingIds = existingHoldings.map((h) => h.id);
    const existingTxns =
      holdingIds.length > 0
        ? await db.query.transactions.findMany({
            where: inArray(schema.transactions.holdingId, holdingIds),
          })
        : [];

    const holdingMap = new Map(existingHoldings.map((h) => [h.id, h]));
    const existingStockKeys = new Set<string>();
    for (const txn of existingTxns) {
      const holding = holdingMap.get(txn.holdingId);
      if (holding) {
        const dateStr =
          txn.date instanceof Date
            ? txn.date.toISOString()
            : new Date(txn.date).toISOString();
        existingStockKeys.add(
          stockTxnDedupKey(dateStr, holding.symbol, txn.type, txn.shares, txn.price)
        );
      }
    }

    // Build dedup set from existing cash transactions
    const existingCashTxns = await db.query.cashTransactions.findMany({
      where: eq(schema.cashTransactions.portfolioId, validated.portfolioId),
    });
    const existingCashKeys = new Set<string>();
    for (const ct of existingCashTxns) {
      const dateStr =
        ct.date instanceof Date
          ? ct.date.toISOString()
          : new Date(ct.date).toISOString();
      existingCashKeys.add(cashTxnDedupKey(dateStr, ct.type, ct.amount));
    }

    // Filter out duplicate stock transactions
    let stockDuplicates = 0;
    const newStockTxns = validated.stockTransactions.filter((txn) => {
      const key = stockTxnDedupKey(txn.date, txn.symbol, txn.type, txn.shares, txn.price);
      if (existingStockKeys.has(key)) {
        stockDuplicates++;
        return false;
      }
      return true;
    });

    // Filter out duplicate cash transactions
    let cashDuplicates = 0;
    const newCashTxns = validated.cashTransactions.filter((txn) => {
      const key = cashTxnDedupKey(txn.date, txn.type, txn.amount);
      if (existingCashKeys.has(key)) {
        cashDuplicates++;
        return false;
      }
      return true;
    });

    // Group stock transactions by symbol
    const bySymbol = new Map<string, typeof newStockTxns>();
    for (const txn of newStockTxns) {
      const existing = bySymbol.get(txn.symbol) || [];
      existing.push(txn);
      bySymbol.set(txn.symbol, existing);
    }

    // Process each symbol: find-or-create holding, insert transactions, recompute
    let stockImported = 0;
    const holdingBySymbol = new Map(
      existingHoldings.map((h) => [h.symbol, h])
    );
    const errors: string[] = [];

    for (const [symbol, txns] of bySymbol) {
      try {
        let holding = holdingBySymbol.get(symbol);

        if (!holding) {
          // Create new holding with zeroed values (will be recomputed)
          const [newHolding] = await db
            .insert(schema.holdings)
            .values({
              portfolioId: validated.portfolioId,
              symbol,
              shares: 0,
              avgCost: 0,
              currency: txns[0].currency,
            })
            .returning();
          holding = newHolding;
          holdingBySymbol.set(symbol, holding);
        }

        // Insert all transactions for this symbol
        for (const txn of txns) {
          await db.insert(schema.transactions).values({
            holdingId: holding.id,
            type: txn.type,
            shares: txn.shares,
            price: txn.price,
            date: new Date(txn.date),
          });
          stockImported++;
        }

        // Recompute holding
        await recomputeHolding(holding.id);
      } catch (e) {
        errors.push(`Error importing ${symbol}: ${e}`);
      }
    }

    // Insert cash transactions
    let cashImported = 0;
    for (const txn of newCashTxns) {
      try {
        await db.insert(schema.cashTransactions).values({
          portfolioId: validated.portfolioId,
          type: txn.type,
          description: txn.description,
          amount: txn.amount,
          currency: txn.currency,
          date: new Date(txn.date),
        });
        cashImported++;
      } catch (e) {
        errors.push(`Error importing cash transaction: ${e}`);
      }
    }

    return NextResponse.json({
      stockImported,
      cashImported,
      duplicatesSkipped: stockDuplicates + cashDuplicates,
      errors,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to import CSV data" },
      { status: 500 }
    );
  }
}
