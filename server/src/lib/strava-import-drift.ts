import type { StravaImportDecision, StravaImportPreviewSnapshotItem } from "shared";

export interface GearAggregateSnapshot {
  gearId: string;
  stravaBikeName: string;
  distanceMeters: number;
  movingTimeMinutes: number;
  activityCount: number;
}

export function detectImportDrift(
  snapshot: StravaImportPreviewSnapshotItem[] | undefined,
  aggregates: Map<string, GearAggregateSnapshot>,
  decisions: StravaImportDecision[],
): string[] {
  if (!snapshot?.length) return [];

  const warnings: string[] = [];
  const snapshotByGear = new Map(snapshot.map((item) => [item.gearId, item]));
  const actionableGearIds = new Set(
    decisions.filter((d) => d.action !== "skip").map((d) => d.gearId),
  );

  for (const gearId of actionableGearIds) {
    const previewed = snapshotByGear.get(gearId);
    const current = aggregates.get(gearId);
    const label = current?.stravaBikeName ?? previewed?.gearId ?? gearId;

    if (!previewed) {
      if (current) {
        warnings.push(`${label}: new Strava bike data appeared since preview.`);
      }
      continue;
    }

    if (!current) {
      warnings.push(`${label}: no longer has ride data on Strava.`);
      continue;
    }

    if (
      previewed.activityCount !== current.activityCount ||
      previewed.distanceMeters !== current.distanceMeters ||
      previewed.movingTimeMinutes !== current.movingTimeMinutes
    ) {
      warnings.push(
        `${label}: ride totals changed since preview (${previewed.activityCount}→${current.activityCount} rides).`,
      );
    }
  }

  return warnings;
}
