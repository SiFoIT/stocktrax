"use client";

import { useState, useEffect, useRef } from "react";
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

  const suggestionsList = showSuggestions && suggestions.length > 0 && (
    <div
      ref={suggestionsRef}
      className="absolute z-50 w-full mt-2 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl max-h-80 overflow-auto"
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion.symbol}
          className={`px-4 py-3 cursor-pointer flex justify-between items-center transition-all ${
            index === selectedIndex
              ? "bg-gradient-to-r from-blue-500/20 to-transparent"
              : "hover:bg-white/5"
          }`}
          onClick={() => handleSelectSuggestion(suggestion)}
        >
          <div className="flex items-center gap-3">
            <StockIcon symbol={suggestion.symbol} size="sm" />
            <div>
              <span className="font-medium text-white">{suggestion.symbol}</span>
              <span className="text-white/50 text-sm ml-2 truncate max-w-[200px] inline-block align-bottom">
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
        <div className="relative w-96">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
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
            className="h-10 pl-10 text-sm bg-white/5 border-white/10 focus:border-blue-500/50 focus:bg-white/10 transition-all"
          />
          {suggestionsList}
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={loading}
          className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 h-10 px-4"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add
            </div>
          )}
        </Button>
        {error && (
          <span className="text-red-400 text-xs bg-red-500/10 px-2 py-1 rounded-lg">{error}</span>
        )}
      </form>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-gradient-to-r from-blue-500/10 to-transparent">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h2 className="font-semibold text-white">Add Symbol</h2>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
          <div className="flex-1 relative">
            <label className="text-sm font-medium mb-2 block text-white/70">Symbol</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
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
                className="pl-10 bg-white/5 border-white/10 focus:border-blue-500/50"
              />
            </div>
            {suggestionsList}
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Adding...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Symbol
              </div>
            )}
          </Button>
        </form>
        {error && (
          <p className="text-red-400 text-sm mt-3 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>
    </div>
  );
}
