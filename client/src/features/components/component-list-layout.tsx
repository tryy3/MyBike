import { cn } from "@/lib/utils";
import { hasStats } from "@/lib/format-stats";
import { ComponentStats } from "@/features/stats/ComponentStats";
import type { ReactNode } from "react";

/** Identity block — category, name, and meta; visually recessed vs. detail tier */
export function ComponentIdentityTier({
  children,
  className,
  separated,
}: {
  children: ReactNode;
  className?: string;
  /** Extra spacing before the detail-tier divider */
  separated?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1", separated && "pb-1", className)}>{children}</div>
  );
}

/** Category label in nav rows — smaller than the component name */
export function ComponentCategoryLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("truncate text-sm font-medium text-muted-foreground/80", className)}>
      {children}
    </span>
  );
}

/** Primary component name — larger than the category label */
export function ComponentNameLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("truncate text-base font-semibold text-foreground", className)}>
      {children}
    </span>
  );
}

/** Brand/model and wear stats on one muted line, separated by · */
export function ComponentMetaLine({
  brandModel,
  distanceMeters,
  movingTimeMinutes,
  className,
}: {
  brandModel: string | null;
  distanceMeters: number | null | undefined;
  movingTimeMinutes: number | null | undefined;
  className?: string;
}) {
  const showStats = hasStats(distanceMeters, movingTimeMinutes);

  if (!brandModel && !showStats) {
    return (
      <span
        className={cn("truncate text-xs text-muted-foreground text-muted-foreground/80", className)}
      >
        —
      </span>
    );
  }

  return (
    <span
      className={cn("truncate text-xs text-muted-foreground text-muted-foreground/80", className)}
    >
      {brandModel}
      {brandModel && showStats ? " · " : null}
      {showStats ? (
        <ComponentStats
          distanceMeters={distanceMeters}
          movingTimeMinutes={movingTimeMinutes}
          className="inline tabular-nums"
        />
      ) : null}
    </span>
  );
}

/** Detail tier below a hairline — notes and room for future fields */
export function ComponentDetailTier({
  notes,
  lineClamp = 2,
}: {
  notes?: string | null;
  lineClamp?: 2 | 3;
}) {
  const text = notes?.trim();
  if (!text) return null;

  return (
    <div className="border-t border-border pt-2">
      <p
        className={cn(
          "text-xs text-muted-foreground whitespace-pre-wrap",
          lineClamp === 2 ? "line-clamp-2" : "line-clamp-3",
        )}
      >
        {text}
      </p>
    </div>
  );
}
