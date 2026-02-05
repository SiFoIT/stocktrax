"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { StockIcon } from "@/components/ui/stock-icon";
import { HoldingWithQuote } from "@/types";

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

interface AddTransactionFormProps {
  portfolioId: number;
  holdings: HoldingWithQuote[];
  onTransactionAdded: () => void;
  prefillSymbol?: string | null;
}

export function AddTransactionForm({ portfolioId, holdings, onTransactionAdded, prefillSymbol }: AddTransactionFormProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("addTransactionOpen") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("addTransactionOpen", String(isOpen));
  }, [isOpen]);
  const [symbol, setSymbol] = useState("");
  const [transactionType, setTransactionType] = useState<"buy" | "sell" | "dividend">("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Handle prefill symbol from context menu
  useEffect(() => {
    if (prefillSymbol) {
      setSymbol(prefillSymbol);
      setIsOpen(true);
      fetchCurrentPrice(prefillSymbol);
    }
  }, [prefillSymbol]);

  // Available shares for sell validation
  const availableShares = holdings.find(
    (h) => h.symbol === symbol.toUpperCase()
  )?.shares;

  // Debounced search
  useEffect(() => {
    if (symbol.length < 1) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(symbol)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        }
      } catch {
        setSuggestions([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [symbol]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchCurrentPrice = async (selectedSymbol: string) => {
    setFetchingPrice(true);
    try {
      const response = await fetch(`/api/stocks/${selectedSymbol}`);
      if (response.ok) {
        const data = await response.json();
        if (data.quote?.price) {
          setPrice(data.quote.price.toFixed(2));
        }
      }
    } catch {
      // Silently fail - user can still enter price manually
    } finally {
      setFetchingPrice(false);
    }
  };

  const handleSelectSuggestion = (suggestion: SearchResult) => {
    setSymbol(suggestion.symbol);
    setShowSuggestions(false);
    setSuggestions([]);
    fetchCurrentPrice(suggestion.symbol);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "EQUITY":
        return "bg-blue-500/20 text-blue-400";
      case "ETF":
        return "bg-purple-500/20 text-purple-400";
      case "CRYPTOCURRENCY":
        return "bg-amber-500/20 text-amber-400";
      case "INDEX":
        return "bg-emerald-500/20 text-emerald-400";
      default:
        return "bg-white/10 text-white/70";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setShowSuggestions(false);

    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(price);

    // Client-side sell validation
    if (transactionType === "sell" && availableShares !== undefined && sharesNum > availableShares) {
      setError(`Cannot sell ${sharesNum} shares. Only ${availableShares} available.`);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          symbol: symbol.toUpperCase(),
          type: transactionType,
          shares: sharesNum,
          price: priceNum,
          date,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          Array.isArray(data.error)
            ? data.error[0]?.message || "Failed to add transaction"
            : data.error || "Failed to add transaction"
        );
      }

      setSymbol("");
      setShares("");
      setPrice("");
      setDate(new Date().toISOString().split("T")[0]);
      setTransactionType("buy");
      onTransactionAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-black/[0.03] to-black/[0.01] dark:from-white/[0.07] dark:to-white/[0.02] border border-black/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500/10 to-transparent hover:from-emerald-500/15 transition-all cursor-pointer ${isOpen ? "border-b border-black/10 dark:border-white/10" : ""}`}
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isOpen ? "M6 12h12" : "M12 6v6m0 0v6m0-6h6m-6 0H6"} />
          </svg>
        </div>
        <h2 className="font-semibold text-black dark:text-white">Add Transaction</h2>
      </button>
      {isOpen && <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Symbol + Type toggle */}
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">Symbol</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <Input
                  ref={inputRef}
                  placeholder="Search stocks, ETFs..."
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value.toUpperCase());
                    setSelectedIndex(-1);
                  }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  required
                  className="pl-10 bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50 focus:bg-white/10 transition-all"
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 w-full mt-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-80 overflow-auto"
                >
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={suggestion.symbol}
                      className={`px-4 py-3 cursor-pointer flex justify-between items-center transition-all ${
                        index === selectedIndex
                          ? "bg-gradient-to-r from-emerald-500/20 to-transparent"
                          : "hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      <div className="flex items-center gap-3">
                        <StockIcon symbol={suggestion.symbol} size="sm" />
                        <div>
                          <span className="font-medium text-black dark:text-white">{suggestion.symbol}</span>
                          <span className="text-black/50 dark:text-white/50 text-sm ml-2 truncate max-w-[200px] inline-block align-bottom">
                            {suggestion.name}
                          </span>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-lg font-medium ${getTypeColor(suggestion.type)}`}>
                        {suggestion.type === "CRYPTOCURRENCY" ? "Crypto" : suggestion.type === "EQUITY" ? suggestion.exchange : suggestion.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">Type</label>
              <div className="flex gap-1 p-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
                {(["buy", "sell", "dividend"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTransactionType(type)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all uppercase ${
                      transactionType === type
                        ? type === "buy"
                          ? "bg-emerald-500 text-white"
                          : type === "sell"
                          ? "bg-red-500 text-white"
                          : "bg-amber-500 text-white"
                        : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Shares, Price, Date, Submit */}
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">
                Shares
                {transactionType === "sell" && availableShares !== undefined && (
                  <span className="ml-2 text-xs text-black/40 dark:text-white/40">
                    (Available: {availableShares.toLocaleString()})
                  </span>
                )}
              </label>
              <Input
                type="number"
                step="any"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                required
                className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50 focus:bg-white/10 transition-all"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">
                Price per Share
                {fetchingPrice && (
                  <span className="ml-2 text-xs text-emerald-400">(fetching...)</span>
                )}
              </label>
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
            <div className="flex-1 min-w-[140px]">
              <label className="text-sm font-medium mb-2 block text-black/70 dark:text-white/70">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 focus:border-emerald-500/50 focus:bg-white/10 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || fetchingPrice}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center gap-2 text-white ${
                transactionType === "buy"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                  : transactionType === "sell"
                  ? "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add {transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}
                </>
              )}
            </button>
          </div>
        </form>
        {error && (
          <p className="text-red-400 text-sm mt-3 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>}
    </div>
  );
}
