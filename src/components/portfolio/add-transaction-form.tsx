"use client";

import { useState, useEffect, useRef } from "react";
import { Minus, Plus, Search } from "lucide-react";
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
  const [transactionType, setTransactionType] = useState<"buy" | "sell" | "dividend" | "transfer_in">("buy");
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
        return "bg-muted text-muted-foreground";
      case "ETF":
        return "bg-muted text-muted-foreground";
      case "CRYPTOCURRENCY":
        return "bg-muted text-muted-foreground";
      case "INDEX":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-accent text-muted-foreground";
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
    <div className="rounded-lg bg-card border border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-3 px-6 py-4 transition-colors cursor-pointer ${isOpen ? "border-b border-border" : ""}`}
      >
        {isOpen ? <Minus className="size-4 text-muted-foreground" /> : <Plus className="size-4 text-muted-foreground" />}
        <h2 className="text-sm font-semibold text-foreground">Add transaction</h2>
      </button>
      {isOpen && <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Symbol + Type toggle */}
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <label className="text-sm font-medium mb-2 block text-foreground/80">Symbol</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle-foreground">
                  <Search className="size-4" />
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
                  className="pl-10 bg-muted border-border focus:border-positive/50 focus:bg-accent transition-colors"
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 w-full mt-2 bg-popover border border-border rounded-md shadow-md max-h-80 overflow-auto"
                >
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={suggestion.symbol}
                      className={`px-4 py-3 cursor-pointer flex justify-between items-center transition-colors ${
                        index === selectedIndex
                          ? "bg-primary/15 text-foreground"
                          : "hover:bg-accent"
                      }`}
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      <div className="flex items-center gap-3">
                        <StockIcon symbol={suggestion.symbol} size="sm" />
                        <div>
                          <span className="font-medium text-foreground">{suggestion.symbol}</span>
                          <span className="text-muted-foreground text-sm ml-2 truncate max-w-[200px] inline-block align-bottom">
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
              <label className="text-sm font-medium mb-2 block text-foreground/80">Type</label>
              <div className="flex gap-1 p-1 rounded-lg bg-muted border border-border">
                {(["buy", "sell", "dividend", "transfer_in"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setTransactionType(type);
                      if (type === "transfer_in") setPrice("0");
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      transactionType === type
                        ? type === "buy"
                          ? "bg-positive/15 text-positive"
                          : type === "sell"
                          ? "bg-negative/15 text-negative"
                          : type === "dividend"
                          ? "bg-warning/15 text-warning"
                          : "bg-blue-500 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {type === "transfer_in" ? "Transfer In" : type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Shares, Price, Date, Submit */}
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="text-sm font-medium mb-2 block text-foreground/80">
                Shares
                {transactionType === "sell" && availableShares !== undefined && (
                  <span className="ml-2 text-xs text-subtle-foreground">
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
                className="bg-muted border-border focus:border-positive/50 focus:bg-accent transition-colors"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-sm font-medium mb-2 block text-foreground/80">
                Price per Share
                {fetchingPrice && (
                  <span className="ml-2 text-xs text-positive">(fetching...)</span>
                )}
              </label>
              <Input
                type="number"
                step="any"
                placeholder="150.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="bg-muted border-border focus:border-positive/50 focus:bg-accent transition-colors"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-sm font-medium mb-2 block text-foreground/80">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-muted border-border focus:border-positive/50 focus:bg-accent transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading || fetchingPrice}
              className={`px-6 py-2.5 rounded-md font-medium transition-colors disabled:opacity-50 flex items-center gap-2 text-foreground ${
                transactionType === "buy"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : transactionType === "sell"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : transactionType === "transfer_in"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Add {transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}
                </>
              )}
            </button>
          </div>
        </form>
        {error && (
          <p className="text-negative text-sm mt-3 bg-negative/10 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>}
    </div>
  );
}
