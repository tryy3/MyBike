export function formatDistance(meters: number): string {
  return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
}

export function formatMovingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

export function hasStats(
  distanceMeters: number | null | undefined,
  movingTimeMinutes: number | null | undefined,
): boolean {
  return (distanceMeters ?? 0) > 0 || (movingTimeMinutes ?? 0) > 0;
}

export function formatStatsLine(
  distanceMeters: number | null | undefined,
  movingTimeMinutes: number | null | undefined,
): string {
  if (!hasStats(distanceMeters, movingTimeMinutes)) return "—";
  const parts: string[] = [];
  if ((distanceMeters ?? 0) > 0) parts.push(formatDistance(distanceMeters!));
  if ((movingTimeMinutes ?? 0) > 0) parts.push(formatMovingTime(movingTimeMinutes!));
  return parts.join(" · ");
}
