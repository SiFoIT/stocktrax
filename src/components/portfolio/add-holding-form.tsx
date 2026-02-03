"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle>Add Holding</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[100px]">
            <label className="text-sm font-medium mb-1 block">Symbol</label>
            <Input
              placeholder="AAPL"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="text-sm font-medium mb-1 block">Shares</label>
            <Input
              type="number"
              step="any"
              placeholder="10"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              required
            />
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="text-sm font-medium mb-1 block">Price per Share</label>
            <Input
              type="number"
              step="any"
              placeholder="150.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
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
