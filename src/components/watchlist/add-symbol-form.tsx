"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StockIcon } from "@/components/ui/stock-icon";

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

interface AddSymbolFormProps {
  watchlistId: number;
  onSymbolAdded: () => void;
  compact?: boolean;
}

export function AddSymbolForm({ watchlistId, onSymbolAdded, compact = false }: AddSymbolFormProps) {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;

    setLoading(true);
    setError(null);
    setShowSuggestions(false);

    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlistId, symbol: symbol.toUpperCase() }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 409) {
          throw new Error("Symbol already in watchlist");
        }
        throw new Error(data.error?.[0]?.message || "Failed to add symbol");
      }

      setSymbol("");
      setSuggestions([]);
      onSymbolAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: SearchResult) => {
    setSymbol(suggestion.symbol);
    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.focus();
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
        return "bg-primary/20 text-primary";
      case "ETF":
        return "bg-purple-500/20 text-purple-400";
      case "CRYPTOCURRENCY":
        return "bg-warning/20 text-warning";
      case "INDEX":
        return "bg-positive/20 text-positive";
      default:
        return "bg-accent text-muted-foreground";
    }
  };

  const suggestionsList = showSuggestions && suggestions.length > 0 && (
    <div
      ref={suggestionsRef}
      className="absolute z-50 w-full mt-2 bg-gray-900/95 border border-border rounded-md max-h-80 overflow-auto"
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion.symbol}
          className={`px-4 py-3 cursor-pointer flex justify-between items-center transition-colors ${
            index === selectedIndex
              ? "bg-accent"
              : "hover:bg-muted"
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
  );

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <div className="relative w-52 lg:w-64">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle-foreground">
            <Search className="size-3.5" />
          </div>
          <Input
            ref={inputRef}
            placeholder="Search stocks, ETFs, crypto..."
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setSelectedIndex(-1);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            className="h-8 pl-8 text-sm"
          />
          {suggestionsList}
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={loading}
          className="h-8"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <div className="flex items-center gap-2">
              <Plus className="size-4" />
              Add
            </div>
          )}
        </Button>
        {error && (
          <span className="text-negative text-xs bg-negative/10 px-2 py-1 rounded-lg">{error}</span>
        )}
      </form>
    );
  }

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Plus className="size-4 text-primary" />
        </div>
        <h2 className="font-semibold text-foreground">Add Symbol</h2>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
          <div className="flex-1 relative">
            <label className="text-sm font-medium mb-2 block text-muted-foreground">Symbol</label>
            <div className="relative">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle-foreground">
                <Search className="size-3.5" />
              </div>
              <Input
                ref={inputRef}
                placeholder="Search stocks, ETFs, crypto..."
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value.toUpperCase());
                  setSelectedIndex(-1);
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                required
                className="pl-10 bg-muted border-border focus:border-primary/50"
              />
            </div>
            {suggestionsList}
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Adding...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Plus className="size-4" />
                Add Symbol
              </div>
            )}
          </Button>
        </form>
        {error && (
          <p className="text-negative text-sm mt-3 bg-negative/10 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>
    </div>
  );
}
