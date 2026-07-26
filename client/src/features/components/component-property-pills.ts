import { LUBE_TYPE_LABELS, type Component, type ComponentProperties, type LubeType } from "shared";

export type PropertyPill = {
  key: string;
  label: string;
  value: string;
};

/** Map stored component properties into display chips (category-aware). */
export function componentPropertyPills(
  category: string,
  properties: ComponentProperties | Component["properties"] | null | undefined,
): PropertyPill[] {
  if (!properties || typeof properties !== "object") return [];

  const pills: PropertyPill[] = [];

  if (category === "chain") {
    const raw = "lubeType" in properties ? properties.lubeType : undefined;
    if (typeof raw === "string" && raw.length > 0) {
      pills.push({
        key: "lubeType",
        label: "Lube",
        value: LUBE_TYPE_LABELS[raw as LubeType] ?? raw,
      });
    }
  }

  return pills;
}
