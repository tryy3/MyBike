/** Split a stored component counter into baseline (manual) after Strava ledger migration. */
export function computeBaseline(
  stored: number | null | undefined,
  stravaWear: number,
): number | null {
  const baseline = Math.max(0, (stored ?? 0) - stravaWear);
  return baseline === 0 ? null : baseline;
}

export function activityDateOnOrAfterCreditFrom(startDate: string, creditFrom: string): boolean {
  return startDate.slice(0, 10) >= creditFrom;
}
