"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const suggestionsList = showSuggestions && suggestions.length > 0 && (
    <div
      ref={suggestionsRef}
      className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-auto"
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={suggestion.symbol}
          className={`px-3 py-2 cursor-pointer flex justify-between items-center ${
            index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
          }`}
          onClick={() => handleSelectSuggestion(suggestion)}
        >
          <div>
            <span className="font-medium">{suggestion.symbol}</span>
            <span className="text-muted-foreground text-sm ml-2 truncate">
              {suggestion.name}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {suggestion.type === "CRYPTOCURRENCY" ? "Crypto" : suggestion.exchange}
          </span>
        </div>
      ))}
    </div>
  );

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <div className="relative w-96">
          <Input
            ref={inputRef}
            placeholder="Add symbol..."
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value.toUpperCase());
              setSelectedIndex(-1);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            className="h-8 text-sm"
          />
          {suggestionsList}
        </div>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "..." : "Add"}
        </Button>
        {error && <span className="text-red-500 text-xs">{error}</span>}
      </form>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Symbol</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
          <div className="flex-1 relative">
            <label className="text-sm font-medium mb-1 block">Symbol</label>
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
            />
            {suggestionsList}
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add"}
          </Button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
}
