"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

interface AddHoldingFormProps {
  portfolioId: number;
  onHoldingAdded: () => void;
}

export function AddHoldingForm({ portfolioId, onHoldingAdded }: AddHoldingFormProps) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          symbol: symbol.toUpperCase(),
          shares: parseFloat(shares),
          avgCost: parseFloat(price),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.[0]?.message || "Failed to add holding");
      }

      setSymbol("");
      setShares("");
      setPrice("");
      onHoldingAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-black/10 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 to-transparent">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h2 className="font-semibold text-black dark:text-white">Add Holding</h2>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">Symbol</label>
            <Input
              placeholder="AAPL"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
              className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50 focus:bg-white/10 transition-all"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">Shares</label>
            <Input
              type="number"
              step="any"
              placeholder="10"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              required
              className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50 focus:bg-white/10 transition-all"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">Price per Share</label>
            <Input
              type="number"
              step="any"
              placeholder="150.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50 focus:bg-white/10 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 dark:border-white/30 border-t-black dark:border-t-white rounded-full animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Holding
              </>
            )}
          </button>
        </form>
        {error && (
          <p className="text-red-400 text-sm mt-3 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>
    </div>
  );
}
