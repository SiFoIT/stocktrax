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
import { WatchlistItemWithQuote } from "@/types";

interface WatchlistTableProps {
  items: WatchlistItemWithQuote[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
  onRemoveSymbol: (id: number) => void;
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

function formatChange(value: number | undefined, percent: number | undefined): string {
  if (value === undefined || percent === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} (${sign}${percent.toFixed(2)}%)`;
}

export function WatchlistTable({
  items,
  selectedSymbol,
  onSelectSymbol,
  onRemoveSymbol,
}: WatchlistTableProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No symbols in watchlist. Add your first symbol above.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={item.id}
            className={`cursor-pointer ${
              selectedSymbol === item.symbol ? "bg-accent" : ""
            }`}
            onClick={() => onSelectSymbol(item.symbol)}
          >
            <TableCell className="font-medium">{item.symbol}</TableCell>
            <TableCell className="text-right">
              {formatCurrency(item.price)}
            </TableCell>
            <TableCell
              className={`text-right ${
                item.change !== undefined
                  ? item.change >= 0
                    ? "text-green-500"
                    : "text-red-500"
                  : ""
              }`}
            >
              {formatChange(item.change, item.changePercent)}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSymbol(item.id);
                }}
              >
                Remove
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
