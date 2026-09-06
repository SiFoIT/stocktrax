"use client";

import { useState } from "react";
import Image from "next/image";

interface StockIconProps {
  symbol: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 40,
};

export function StockIcon({ symbol, size = "md" }: StockIconProps) {
  const [hasError, setHasError] = useState(false);
  const pixels = sizeMap[size];

  if (hasError) {
    return (
      <div
        className="rounded-lg bg-muted flex items-center justify-center"
        style={{ width: pixels, height: pixels }}
      >
        <span
          className="font-bold text-primary"
          style={{ fontSize: size === "sm" ? 10 : size === "md" ? 12 : 14 }}
        >
          {symbol.slice(0, 2)}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={`https://assets.parqet.com/logos/symbol/${symbol}`}
      alt={`${symbol} logo`}
      width={pixels}
      height={pixels}
      className="rounded-lg"
      unoptimized
      onError={() => setHasError(true)}
    />
  );
}
