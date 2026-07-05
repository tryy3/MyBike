import { formatStatsLine } from "@/lib/format-stats";
import { cn } from "@/lib/utils";

interface ComponentStatsProps {
  distanceMeters: number | null | undefined;
  movingTimeMinutes: number | null | undefined;
  className?: string;
}

export function ComponentStats({
  distanceMeters,
  movingTimeMinutes,
  className,
}: ComponentStatsProps) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatStatsLine(distanceMeters, movingTimeMinutes)}
    </span>
  );
}
