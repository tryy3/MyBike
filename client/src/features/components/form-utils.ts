/** Convert stored meters to a km string for form display (one decimal max). */
export function metersToKmInput(meters: number | null | undefined): string {
  if (meters == null) return "";
  const km = meters / 1000;
  const rounded = Math.round(km * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Convert a km form value to integer meters for the API. */
export function kmInputToMeters(km: string): number | null {
  const trimmed = km.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

export function minutesToHoursMinutes(minutes: number | null | undefined): {
  hours: string;
  minutes: string;
} {
  if (minutes == null) return { hours: "", minutes: "" };
  return {
    hours: String(Math.floor(minutes / 60)),
    minutes: String(minutes % 60),
  };
}

export function hoursMinutesToMinutes(hours: string, minutes: string): number | null {
  const hoursEmpty = hours.trim() === "";
  const minutesEmpty = minutes.trim() === "";
  if (hoursEmpty && minutesEmpty) return null;

  const h = hoursEmpty ? 0 : Number(hours);
  const m = minutesEmpty ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}
