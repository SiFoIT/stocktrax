"use client";

import { useState, useMemo } from "react";
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

type SortColumn = "symbol" | "price" | "1D" | "5D" | "1M" | "3M" | "1Y";
type SortDirection = "asc" | "desc";

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

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getChangeColor(value: number | undefined): string {
  if (value === undefined) return "";
  return value >= 0 ? "text-green-500" : "text-red-500";
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (!direction) {
    return <span className="ml-1 text-muted-foreground/50">↕</span>;
  }
  return <span className="ml-1">{direction === "asc" ? "↑" : "↓"}</span>;
}

export function WatchlistTable({
  items,
  selectedSymbol,
  onSelectSymbol,
  onRemoveSymbol,
}: WatchlistTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortColumn) return items;

    return [...items].sort((a, b) => {
      let aVal: number | string | undefined;
      let bVal: number | string | undefined;

      switch (sortColumn) {
        case "symbol":
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case "price":
          aVal = a.price;
          bVal = b.price;
          break;
        case "1D":
          aVal = a.changePercent;
          bVal = b.changePercent;
          break;
        case "5D":
          aVal = a.change5D;
          bVal = b.change5D;
          break;
        case "1M":
          aVal = a.change1M;
          bVal = b.change1M;
          break;
        case "3M":
          aVal = a.change3M;
          bVal = b.change3M;
          break;
        case "1Y":
          aVal = a.change1Y;
          bVal = b.change1Y;
          break;
      }

      // Handle undefined values - push them to the end
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else {
        comparison = (aVal as number) - (bVal as number);
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [items, sortColumn, sortDirection]);

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No symbols in watchlist. Add your first symbol above.
      </div>
    );
  }

  const headerClass = "text-right cursor-pointer hover:bg-accent/50 select-none";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead
            className="cursor-pointer hover:bg-accent/50 select-none"
            onClick={() => handleSort("symbol")}
          >
            Symbol
            <SortIcon direction={sortColumn === "symbol" ? sortDirection : null} />
          </TableHead>
          <TableHead className={headerClass} onClick={() => handleSort("price")}>
            Price
            <SortIcon direction={sortColumn === "price" ? sortDirection : null} />
          </TableHead>
          <TableHead className={headerClass} onClick={() => handleSort("1D")}>
            1D
            <SortIcon direction={sortColumn === "1D" ? sortDirection : null} />
          </TableHead>
          <TableHead className={headerClass} onClick={() => handleSort("5D")}>
            5D
            <SortIcon direction={sortColumn === "5D" ? sortDirection : null} />
          </TableHead>
          <TableHead className={headerClass} onClick={() => handleSort("1M")}>
            1M
            <SortIcon direction={sortColumn === "1M" ? sortDirection : null} />
          </TableHead>
          <TableHead className={headerClass} onClick={() => handleSort("3M")}>
            3M
            <SortIcon direction={sortColumn === "3M" ? sortDirection : null} />
          </TableHead>
          <TableHead className={headerClass} onClick={() => handleSort("1Y")}>
            1Y
            <SortIcon direction={sortColumn === "1Y" ? sortDirection : null} />
          </TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedItems.map((item) => (
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
            <TableCell className={`text-right ${getChangeColor(item.changePercent)}`}>
              {formatPercent(item.changePercent)}
            </TableCell>
            <TableCell className={`text-right ${getChangeColor(item.change5D)}`}>
              {formatPercent(item.change5D)}
            </TableCell>
            <TableCell className={`text-right ${getChangeColor(item.change1M)}`}>
              {formatPercent(item.change1M)}
            </TableCell>
            <TableCell className={`text-right ${getChangeColor(item.change3M)}`}>
              {formatPercent(item.change3M)}
            </TableCell>
            <TableCell className={`text-right ${getChangeColor(item.change1Y)}`}>
              {formatPercent(item.change1Y)}
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
