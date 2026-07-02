"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  parseMultipleFiles,
  parseAcbTable,
  stockTxnDedupKey,
  cashTxnDedupKey,
  type WealthSimpleParseResult,
  type ParsedStockTransaction,
  type ParsedCashTransaction,
} from "@/lib/import/wealthsimple-parser";
import { TransactionWithSymbol } from "@/types";

interface CsvImportModalProps {
  portfolioId: number;
  existingTransactions: TransactionWithSymbol[];
  onImportComplete: () => void;
  onClose: () => void;
}

type Step = "institution" | "files" | "preview" | "acb" | "importing" | "success";

interface AcbEntry {
  symbol: string;
  shares: number;
  acbPerShare: number;
  date: string; // earliest transfer date (ISO)
}

interface ImportResult {
  stockImported: number;
  cashImported: number;
  duplicatesSkipped: number;
  errors: string[];
}

export function CsvImportModal({
  portfolioId,
  existingTransactions,
  onImportComplete,
  onClose,
}: CsvImportModalProps) {
  const [step, setStep] = useState<Step>("institution");
  const [parseResult, setParseResult] = useState<WealthSimpleParseResult | null>(null);
  const [dedupedStock, setDedupedStock] = useState<ParsedStockTransaction[]>([]);
  const [dedupedCash, setDedupedCash] = useState<ParsedCashTransaction[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [acbEntries, setAcbEntries] = useState<AcbEntry[]>([]);
  const [acbPasteText, setAcbPasteText] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [showUnrecognized, setShowUnrecognized] = useState(false);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "importing") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, step]);

  // Build dedup set from existing transactions
  const existingKeys = useCallback(() => {
    const keys = new Set<string>();
    for (const txn of existingTransactions) {
      keys.add(stockTxnDedupKey(txn.date, txn.symbol, txn.type, txn.shares, txn.price));
    }
    return keys;
  }, [existingTransactions]);

  const processFiles = useCallback(
    async (fileList: { name: string; content: string }[]) => {
      const result = parseMultipleFiles(fileList);
      setParseResult(result);

      // Dedup stock transactions against existing
      const keys = existingKeys();
      let dupes = 0;
      const newStock = result.stockTransactions.filter((txn) => {
        const key = stockTxnDedupKey(txn.date, txn.symbol, txn.type, txn.shares, txn.price);
        if (keys.has(key)) {
          dupes++;
          return false;
        }
        // Add to keys so within-batch dupes are also caught
        keys.add(key);
        return true;
      });

      // Dedup cash transactions (no existing cash to compare against initially — API handles it)
      // But we can dedup within the batch
      const cashKeys = new Set<string>();
      const newCash = result.cashTransactions.filter((txn) => {
        const key = cashTxnDedupKey(txn.date, txn.type, txn.amount, txn.currency);
        if (cashKeys.has(key)) {
          dupes++;
          return false;
        }
        cashKeys.add(key);
        return true;
      });

      setDedupedStock(newStock);
      setDedupedCash(newCash);
      setDuplicateCount(dupes);

      // Build ACB entries from transfer_in transactions
      const transferSymbols = new Map<string, { shares: number; earliestDate: string }>();
      for (const txn of newStock) {
        if (txn.type === "transfer_in") {
          const existing = transferSymbols.get(txn.symbol);
          if (existing) {
            existing.shares += txn.shares;
            if (txn.date < existing.earliestDate) existing.earliestDate = txn.date;
          } else {
            transferSymbols.set(txn.symbol, { shares: txn.shares, earliestDate: txn.date });
          }
        }
      }
      const entries: AcbEntry[] = Array.from(transferSymbols.entries()).map(
        ([symbol, { shares, earliestDate }]) => ({ symbol, shares, acbPerShare: 0, date: earliestDate })
      );
      entries.sort((a, b) => a.symbol.localeCompare(b.symbol));
      setAcbEntries(entries);

      setStep("preview");
    },
    [existingKeys]
  );

  const readFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter(
        (f) => f.name.endsWith(".csv") || f.type === "text/csv"
      );

      if (fileArray.length === 0) return;

      const fileData: { name: string; content: string }[] = [];
      for (const file of fileArray) {
        const content = await file.text();
        fileData.push({ name: file.name, content });
      }

      processFiles(fileData);
    },
    [processFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        readFiles(e.dataTransfer.files);
      }
    },
    [readFiles]
  );

  const handleParseAcb = () => {
    if (!acbPasteText.trim()) return;
    const symbols = acbEntries.map((e) => e.symbol);
    const parsed = parseAcbTable(acbPasteText, symbols);

    setAcbEntries((prev) =>
      prev.map((entry) => {
        const data = parsed.get(entry.symbol);
        if (data) {
          return {
            ...entry,
            acbPerShare: data.bookCost / data.quantity,
          };
        }
        return entry;
      })
    );
  };

  const handleImport = async () => {
    setStep("importing");
    setImporting(true);

    // Apply ACB to transfer_in transactions
    const acbMap = new Map(acbEntries.map((e) => [e.symbol, e.acbPerShare]));
    const finalStock = dedupedStock.map((txn) => {
      if (txn.type === "transfer_in") {
        const acb = acbMap.get(txn.symbol) || 0;
        return { ...txn, price: acb };
      }
      return txn;
    });

    try {
      const response = await fetch("/api/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          stockTransactions: finalStock,
          cashTransactions: dedupedCash,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setImportResult({
          stockImported: 0,
          cashImported: 0,
          duplicatesSkipped: 0,
          errors: [data.error || "Import failed"],
        });
      } else {
        const data = await response.json();
        setImportResult(data);
      }
    } catch (e) {
      setImportResult({
        stockImported: 0,
        cashImported: 0,
        duplicatesSkipped: 0,
        errors: [`Network error: ${e}`],
      });
    } finally {
      setImporting(false);
      setStep("success");
    }
  };

  const handleSuccessClose = () => {
    onImportComplete();
    onClose();
  };

  // Count transaction types for preview
  const countByType = (txns: ParsedStockTransaction[]) => {
    const counts = { buy: 0, sell: 0, dividend: 0, transfer_in: 0 };
    for (const t of txns) counts[t.type]++;
    return counts;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={step !== "importing" ? onClose : undefined}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[85vh] mx-4 bg-white dark:bg-zinc-900 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-black dark:text-white">Import CSV</h2>
              <p className="text-xs text-black/50 dark:text-white/50">
                {step === "institution" && "Select your brokerage"}
                {step === "files" && "Select CSV files to import"}
                {step === "preview" && "Review transactions before importing"}
                {step === "acb" && "Enter cost basis for transfers"}
                {step === "importing" && "Importing..."}
                {step === "success" && "Import complete"}
              </p>
            </div>
          </div>
          {step !== "importing" && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 flex-1">
          {/* Step 0: Institution Selection */}
          {step === "institution" && (
            <div className="space-y-4">
              <p className="text-sm text-black/60 dark:text-white/60">
                Select the financial institution your CSV files are from:
              </p>
              <button
                onClick={() => setStep("files")}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-black/10 dark:border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  W
                </div>
                <div className="text-left">
                  <p className="font-semibold text-black dark:text-white group-hover:text-blue-400 transition-colors">WealthSimple</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Monthly statement CSV files</p>
                </div>
                <svg className="w-5 h-5 ml-auto text-black/20 dark:text-white/20 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-black/5 dark:border-white/5 opacity-40 cursor-not-allowed">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  +
                </div>
                <div className="text-left">
                  <p className="font-semibold text-black dark:text-white">More coming soon</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Questrade, Interactive Brokers, etc.</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: File Selection */}
          {step === "files" && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                  dragOver
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-black/70 dark:text-white/70 font-medium mb-1">
                  Drag & drop CSV files here
                </p>
                <p className="text-sm text-black/40 dark:text-white/40 mb-4">
                  or use the buttons below
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
                  >
                    Choose Files
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black/70 dark:text-white/70 text-sm font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  >
                    Choose Folder
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && readFiles(e.target.files)}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  accept=".csv"
                  // @ts-expect-error - webkitdirectory is a valid attribute
                  webkitdirectory=""
                  className="hidden"
                  onChange={(e) => e.target.files && readFiles(e.target.files)}
                />
              </div>
              <button
                onClick={() => setStep("institution")}
                className="text-sm text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && parseResult && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const counts = countByType(dedupedStock);
                  return (
                    <>
                      <SummaryCard label="Buys" count={counts.buy} color="emerald" />
                      <SummaryCard label="Sells" count={counts.sell} color="red" />
                      <SummaryCard label="Dividends" count={counts.dividend} color="amber" />
                      <SummaryCard label="Transfers In" count={counts.transfer_in} color="blue" />
                    </>
                  );
                })()}
              </div>

              {(() => {
                const fxCount = dedupedCash.filter((t) => t.type === "fx_conversion").length;
                const otherCashCount = dedupedCash.length - fxCount;
                return (
                  <>
                    {otherCashCount > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm text-purple-300">
                          {otherCashCount} cash transaction{otherCashCount !== 1 ? "s" : ""} to import
                        </span>
                      </div>
                    )}
                    {fxCount > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
                        <svg className="w-4 h-4 text-sky-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        <span className="text-sm text-sky-300">
                          {fxCount} FX conversion{fxCount !== 1 ? "s" : ""} to import
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}

              {duplicateCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-amber-300">
                    {duplicateCount} duplicate{duplicateCount !== 1 ? "s" : ""} will be skipped
                  </span>
                </div>
              )}

              {parseResult.skipped.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                  <svg className="w-4 h-4 text-black/30 dark:text-white/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span className="text-sm text-black/50 dark:text-white/50">
                    {parseResult.skipped.length} LOAN/RECALL/FPLINT rows skipped
                  </span>
                </div>
              )}

              {parseResult.unrecognized.length > 0 && (
                <div className="rounded-lg border border-orange-500/20 overflow-hidden">
                  <button
                    onClick={() => setShowUnrecognized(!showUnrecognized)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-orange-500/10 hover:bg-orange-500/15 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-sm text-orange-300">
                        {parseResult.unrecognized.length} unrecognized transaction type{parseResult.unrecognized.length !== 1 ? "s" : ""} (will be skipped)
                      </span>
                    </div>
                    <svg className={`w-4 h-4 text-orange-400 transition-transform ${showUnrecognized ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showUnrecognized && (
                    <div className="px-3 py-2 max-h-40 overflow-y-auto">
                      {parseResult.unrecognized.map((row, i) => (
                        <div key={i} className="text-xs text-black/50 dark:text-white/50 py-1 border-b border-black/5 dark:border-white/5 last:border-0">
                          <span className="font-mono text-orange-400">{row.wsType || "(unknown)"}</span>
                          {row.description ? ` — ${row.description}` : ""}
                          {row.amount ? ` · ${row.amount}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {parseResult.errors.length > 0 && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-sm font-medium text-red-400 mb-1">Parse errors:</p>
                  {parseResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-300">{err}</p>
                  ))}
                </div>
              )}

              {dedupedStock.length === 0 && dedupedCash.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-black/50 dark:text-white/50">
                    No new transactions to import. All records already exist.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: ACB Entry */}
          {step === "acb" && (
            <div className="space-y-5">
              <div>
                <h3 className="font-medium text-black dark:text-white mb-1">
                  Enter cost basis for transferred positions
                </h3>
                <p className="text-sm text-black/50 dark:text-white/50">
                  Paste your statement data below to auto-fill, or manually enter ACB per share.
                </p>
              </div>

              {/* Paste area */}
              <div>
                <textarea
                  value={acbPasteText}
                  onChange={(e) => setAcbPasteText(e.target.value)}
                  placeholder="Paste your WealthSimple statement data here (positions table with book cost)..."
                  className="w-full h-28 px-3 py-2 text-sm font-mono rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={handleParseAcb}
                  disabled={!acbPasteText.trim()}
                  className="mt-2 px-4 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  Parse Statement Data
                </button>
              </div>

              {/* Editable ACB table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black/10 dark:border-white/10">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-black/50 dark:text-white/50 uppercase">Symbol</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-black/50 dark:text-white/50 uppercase">Date</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-black/50 dark:text-white/50 uppercase">Shares</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-black/50 dark:text-white/50 uppercase">ACB/Share</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-black/50 dark:text-white/50 uppercase">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acbEntries.map((entry, i) => (
                      <tr key={entry.symbol} className="border-b border-black/5 dark:border-white/5">
                        <td className="px-3 py-2 font-semibold text-black dark:text-white">{entry.symbol}</td>
                        <td className="px-3 py-2 text-sm text-black/60 dark:text-white/60">{new Date(entry.date).toLocaleDateString("en-CA")}</td>
                        <td className="px-3 py-2 text-right font-mono text-black/70 dark:text-white/70">{entry.shares.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={entry.acbPerShare || ""}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setAcbEntries((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], acbPerShare: val };
                                return next;
                              });
                            }}
                            className="w-24 px-2 py-1 text-right text-sm font-mono rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-black/70 dark:text-white/70">
                          ${(entry.shares * entry.acbPerShare).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
              <p className="text-black/60 dark:text-white/60">Importing transactions...</p>
            </div>
          )}

          {/* Step 5: Success */}
          {step === "success" && importResult && (
            <div className="space-y-4">
              {importResult.errors.length === 0 ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <svg className="w-6 h-6 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-emerald-400">Import successful!</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <svg className="w-6 h-6 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-medium text-amber-400">Import completed with some errors</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                  <p className="text-2xl font-bold text-emerald-400">{importResult.stockImported}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Stock Transactions</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                  <p className="text-2xl font-bold text-purple-400">{importResult.cashImported}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Cash Transactions</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                  <p className="text-2xl font-bold text-amber-400">{importResult.duplicatesSkipped}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Duplicates Skipped</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-sm font-medium text-red-400 mb-1">Errors:</p>
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-300">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between shrink-0">
          {step === "preview" && (
            <>
              <button
                onClick={() => setStep("files")}
                className="text-sm text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
              >
                &larr; Choose different files
              </button>
              <button
                onClick={() => {
                  if (acbEntries.length > 0) {
                    setStep("acb");
                  } else {
                    handleImport();
                  }
                }}
                disabled={dedupedStock.length === 0 && dedupedCash.length === 0}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 transition-all"
              >
                {acbEntries.length > 0 ? "Next: Enter Cost Basis" : `Import ${dedupedStock.length + dedupedCash.length} Transactions`}
              </button>
            </>
          )}
          {step === "acb" && (
            <>
              <button
                onClick={() => setStep("preview")}
                className="text-sm text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
              >
                &larr; Back to preview
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleImport}
                  className="text-sm text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                >
                  Skip — I&apos;ll add cost basis later
                </button>
                <button
                  onClick={handleImport}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-medium hover:from-blue-600 hover:to-indigo-600 transition-all"
                >
                  Import {dedupedStock.length + dedupedCash.length} Transactions
                </button>
              </div>
            </>
          )}
          {step === "success" && (
            <div className="w-full flex justify-end">
              <button
                onClick={handleSuccessClose}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:from-emerald-600 hover:to-teal-600 transition-all"
              >
                Done
              </button>
            </div>
          )}
          {(step === "institution" || step === "files" || step === "importing") && (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  };
  const classes = colorMap[color] || colorMap.blue;

  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${classes}`}>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xl font-bold">{count}</span>
    </div>
  );
}
