"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { HoldingWithQuote } from "@/types";

interface HoldingsTableProps {
  holdings: HoldingWithQuote[];
  selectedSymbol?: string;
  onSelectHolding: (symbol: string) => void;
  onDeleteHolding: (id: number) => void;
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined) return "-";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function HoldingsTable({
  holdings,
  selectedSymbol,
  onSelectHolding,
  onDeleteHolding,
}: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No holdings yet. Add your first holding above.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Shares</TableHead>
          <TableHead className="text-right">Avg Cost</TableHead>
          <TableHead className="text-right">Current Price</TableHead>
          <TableHead className="text-right">Market Value</TableHead>
          <TableHead className="text-right">Gain/Loss</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((holding) => (
          <TableRow
            key={holding.id}
            className={`cursor-pointer ${
              selectedSymbol === holding.symbol ? "bg-accent" : ""
            }`}
            onClick={() => onSelectHolding(holding.symbol)}
          >
            <TableCell className="font-medium">{holding.symbol}</TableCell>
            <TableCell className="text-right">
              {holding.shares.toLocaleString()}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(holding.avgCost)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(holding.currentPrice)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(holding.marketValue)}
            </TableCell>
            <TableCell
              className={`text-right ${
                holding.gainLoss !== undefined
                  ? holding.gainLoss >= 0
                    ? "text-green-500"
                    : "text-red-500"
                  : ""
              }`}
            >
              {holding.gainLoss !== undefined && (
                <>
                  {formatCurrency(holding.gainLoss)}
                  <br />
                  <span className="text-xs">
                    {formatPercent(holding.gainLossPercent)}
                  </span>
                </>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteHolding(holding.id);
                }}
              >
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
