export interface CategoryDef {
  id: string;
  label: string;
  order: number;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { id: "frame", label: "Frame", order: 10 },
  { id: "fork", label: "Fork", order: 20 },
  { id: "headset", label: "Headset", order: 30 },
  { id: "handlebar", label: "Handlebar", order: 40 },
  { id: "stem", label: "Stem", order: 50 },
  { id: "bar-tape", label: "Bar tape / Grips", order: 60 },
  { id: "shift-levers", label: "Shift levers", order: 70 },
  { id: "brake-levers", label: "Brake levers", order: 80 },
  { id: "front-derailleur", label: "Front derailleur", order: 90 },
  { id: "rear-derailleur", label: "Rear derailleur", order: 100 },
  { id: "crankset", label: "Crankset", order: 110 },
  { id: "bottom-bracket", label: "Bottom bracket", order: 120 },
  { id: "cassette", label: "Cassette", order: 130 },
  { id: "chain", label: "Chain", order: 140 },
  { id: "brakes", label: "Brakes", order: 150 },
  { id: "front-wheel", label: "Front wheel", order: 160 },
  { id: "rear-wheel", label: "Rear wheel", order: 170 },
  { id: "hubs", label: "Hubs", order: 180 },
  { id: "rims", label: "Rims", order: 190 },
  { id: "spokes", label: "Spokes", order: 200 },
  { id: "front-tire", label: "Front tire", order: 210 },
  { id: "rear-tire", label: "Rear tire", order: 220 },
  { id: "saddle", label: "Saddle", order: 230 },
  { id: "seatpost", label: "Seatpost", order: 240 },
  { id: "pedals", label: "Pedals", order: 250 },
  { id: "other", label: "Other", order: 999 },
] as const;

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [
  (typeof CATEGORIES)[number]["id"],
  ...string[],
];

export function getCategory(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function categoryLabel(id: string): string {
  return getCategory(id)?.label ?? id;
}
