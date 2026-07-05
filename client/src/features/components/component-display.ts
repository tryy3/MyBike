import type { Component } from "shared";

type ComponentMeta = Pick<Component, "brand" | "model">;

/** Brand and model joined for display, or null when both are empty. */
export function componentBrandModel(component: ComponentMeta): string | null {
  const value = [component.brand, component.model].filter(Boolean).join(" · ");
  return value || null;
}
