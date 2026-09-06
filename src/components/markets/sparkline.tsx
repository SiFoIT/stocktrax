interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive: boolean;
  className?: string;
}

export function Sparkline({ data, width = 60, height = 24, positive, className }: SparklineProps) {
  if (data.length < 2) {
    return <div style={{ width, height }} className={className} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const strokeColor = positive ? "var(--positive)" : "var(--negative)";

  return (
    <svg width={width} height={height} className={`overflow-visible ${className ?? ""}`}>
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
