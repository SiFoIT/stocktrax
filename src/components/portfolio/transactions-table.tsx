"use client";

import { useState, useEffect, useRef } from "react";
import { StockIcon } from "@/components/ui/stock-icon";
import { TransactionWithSymbol } from "@/types";

interface TransactionsTableProps {
  transactions: TransactionWithSymbol[];
  onEditTransaction: (id: number, data: { shares?: number; price?: number; date?: string; type?: string }) => void;
  onDeleteTransaction: (id: number) => void;
}

function formatCurrency(value: number, currency = "USD"): string {
  const sym = currency === "CAD" ? "C$" : currency === "USD" ? "US$" : "$";
  return `${sym}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toInputDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0];
}

function getTypeBadge(type: string) {
  switch (type) {
    case "buy":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "sell":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    case "dividend":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    default:
      return "bg-white/10 text-white/70 border-white/10";
  }
}

interface ContextMenu {
  x: number;
  y: number;
  transactionId: number;
}

export function TransactionsTable({
  transactions,
  onEditTransaction,
  onDeleteTransaction,
}: TransactionsTableProps) {
  const [viewMode, setViewMode] = useState<"chronological" | "bySymbol">("chronological");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editShares, setEditShares] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDate, setEditDate] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [collapsedSymbols, setCollapsedSymbols] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "symbol" | "type" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: "date" | "symbol" | "type") => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        if (editingId !== null) setEditingId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [editingId]);

  const startEditing = (txn: TransactionWithSymbol) => {
    setEditingId(txn.id);
    setEditShares(txn.shares.toString());
    setEditPrice(txn.price.toString());
    setEditDate(toInputDate(txn.date));
    setContextMenu(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = () => {
    if (editingId === null) return;
    const shares = parseFloat(editShares);
    const price = parseFloat(editPrice);
    if (isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) return;
    onEditTransaction(editingId, { shares, price, date: editDate });
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditing();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  const handleContextMenu = (e: React.MouseEvent, transactionId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, transactionId });
  };

  const toggleSymbolCollapse = (symbol: string) => {
    setCollapsedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const filteredUnsorted = search
    ? transactions.filter((txn) =>
        txn.symbol.toLowerCase().includes(search.toLowerCase()) ||
        txn.type.toLowerCase().includes(search.toLowerCase())
      )
    : transactions;

  const filtered = sortKey
    ? [...filteredUnsorted].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "date") cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
        else if (sortKey === "symbol") cmp = a.symbol.localeCompare(b.symbol);
        else if (sortKey === "type") cmp = a.type.localeCompare(b.type);
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filteredUnsorted;

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No Transactions Yet</h3>
        <p className="text-black/50 dark:text-white/50">Add your first transaction using the form above.</p>
      </div>
    );
  }

  const renderRow = (txn: TransactionWithSymbol, index: number, showSymbol = true) => (
    <tr
      key={txn.id}
      className={`border-b border-white/5 transition-all hover:bg-black/5 dark:hover:bg-white/5 ${
        index % 2 === 0 ? "bg-black/[0.02] dark:bg-white/[0.02]" : ""
      }`}
      onContextMenu={(e) => handleContextMenu(e, txn.id)}
    >
      <td className="px-4 py-3 text-sm">
        {editingId === txn.id ? (
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-32 px-2 py-1 text-sm rounded-lg bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <span className="text-black/70 dark:text-white/70">{formatDate(txn.date)}</span>
        )}
      </td>
      {showSymbol && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <StockIcon symbol={txn.symbol} size="sm" />
            <span className="font-semibold text-sm text-black dark:text-white">{txn.symbol}</span>
          </div>
        </td>
      )}
      <td className="px-4 py-3">
        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold uppercase border ${getTypeBadge(txn.type)}`}>
          {txn.type}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {editingId === txn.id ? (
          <input
            type="number"
            value={editShares}
            onChange={(e) => setEditShares(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-20 px-2 py-1 text-right text-sm font-mono rounded-lg bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="0"
            step="any"
            autoFocus
          />
        ) : (
          <span className="font-mono text-sm text-black dark:text-white">{txn.shares.toLocaleString()}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {editingId === txn.id ? (
          <input
            type="number"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-24 px-2 py-1 text-right text-sm font-mono rounded-lg bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="0"
            step="any"
          />
        ) : (
          <span className="font-mono text-sm text-black/70 dark:text-white/70">{formatCurrency(txn.price, txn.currency)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-sm font-semibold text-black dark:text-white">
          {formatCurrency(txn.shares * txn.price, txn.currency)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          {editingId === txn.id ? (
            <>
              <button
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 p-2 rounded-lg transition-all"
                onClick={saveEditing}
                title="Save"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 p-2 rounded-lg transition-all"
                onClick={cancelEditing}
                title="Cancel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                className="text-black/40 dark:text-white/40 hover:text-blue-400 hover:bg-blue-500/10 p-2 rounded-lg transition-all"
                onClick={() => startEditing(txn)}
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                className="text-black/40 dark:text-white/40 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all"
                onClick={() => onDeleteTransaction(txn.id)}
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  const sortArrow = (key: "date" | "symbol" | "type") => {
    if (sortKey !== key) return null;
    return (
      <svg className="w-3 h-3 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
      </svg>
    );
  };

  const sortableThClass = "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-left cursor-pointer select-none transition-colors hover:text-black dark:hover:text-white";
  const staticThClass = "px-4 py-3 text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider text-right";

  const tableHeaders = (showSymbol = true) => (
    <thead>
      <tr className="border-b border-black/10 dark:border-white/10">
        <th className={`${sortableThClass} ${sortKey === "date" ? "text-blue-400 dark:text-blue-400" : "text-black/50 dark:text-white/50"}`} onClick={() => toggleSort("date")}>
          Date{sortArrow("date")}
        </th>
        {showSymbol && (
          <th className={`${sortableThClass} ${sortKey === "symbol" ? "text-blue-400 dark:text-blue-400" : "text-black/50 dark:text-white/50"}`} onClick={() => toggleSort("symbol")}>
            Symbol{sortArrow("symbol")}
          </th>
        )}
        <th className={`${sortableThClass} ${sortKey === "type" ? "text-blue-400 dark:text-blue-400" : "text-black/50 dark:text-white/50"}`} onClick={() => toggleSort("type")}>
          Type{sortArrow("type")}
        </th>
        <th className={staticThClass}>Shares</th>
        <th className={staticThClass}>Price</th>
        <th className={staticThClass}>Total</th>
        <th className={staticThClass}>Actions</th>
      </tr>
    </thead>
  );

  // Group filtered transactions by symbol
  const grouped = filtered.reduce<Record<string, TransactionWithSymbol[]>>((acc, txn) => {
    if (!acc[txn.symbol]) acc[txn.symbol] = [];
    acc[txn.symbol].push(txn);
    return acc;
  }, {});

  return (
    <div>
      {/* Toolbar: view toggle + search */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex gap-1 p-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 w-fit">
          <button
            onClick={() => setViewMode("chronological")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === "chronological"
                ? "bg-blue-500 text-white"
                : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            Chronological
          </button>
          <button
            onClick={() => setViewMode("bySymbol")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === "bySymbol"
                ? "bg-blue-500 text-white"
                : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            By Symbol
          </button>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by symbol or type..."
            className="w-56 pl-9 pr-8 py-1.5 text-sm rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white placeholder-black/30 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 && search ? (
        <div className="text-center py-8 text-black/50 dark:text-white/50 text-sm">
          No transactions matching &ldquo;{search}&rdquo;
        </div>
      ) : viewMode === "chronological" ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            {tableHeaders(true)}
            <tbody>
              {filtered.map((txn, i) => renderRow(txn, i, true))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([symbol, txns]) => {
              const isCollapsed = collapsedSymbols.has(symbol);
              return (
                <div key={symbol} className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
                  <button
                    onClick={() => toggleSymbolCollapse(symbol)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <StockIcon symbol={symbol} size="sm" />
                      <span className="font-semibold text-black dark:text-white">{symbol}</span>
                      <span className="text-xs text-black/50 dark:text-white/50">
                        {txns.length} transaction{txns.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-black/40 dark:text-white/40 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        {tableHeaders(false)}
                        <tbody>
                          {txns.map((txn, i) => renderRow(txn, i, false))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[140px] rounded-xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-4 py-2.5 text-left text-sm text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-3 transition-colors"
            onClick={() => {
              const txn = transactions.find((t) => t.id === contextMenu.transactionId);
              if (txn) startEditing(txn);
            }}
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit
          </button>
          <button
            className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors"
            onClick={() => {
              onDeleteTransaction(contextMenu.transactionId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
