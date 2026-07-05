import { useMemo, useState } from "react";
import type { Component } from "shared";
import { groupCategoriesBySystem } from "shared";

import { CategoryDetailDialog } from "./CategoryDetailDialog";
import { CategoryDetailPanel } from "./CategoryDetailPanel";
import { ComponentsNav } from "./ComponentsNav";
import type { CategoryFormMode } from "./CategoryDetailContent";

export type WearDisplay = {
  distanceMeters: number | null;
  movingTimeMinutes: number | null;
};

export type WearByComponentId = Map<string, WearDisplay>;

interface ComponentsSplitViewProps {
  bikeId: string;
  components: Component[];
  showEmptyCategories: boolean;
  categoriesUsed: number;
  wearByComponentId?: WearByComponentId;
}

function buildCategoryMap(components: Component[]): Map<string, Component[]> {
  const map = new Map<string, Component[]>();
  for (const c of components) {
    const list = map.get(c.category);
    if (list) list.push(c);
    else map.set(c.category, [c]);
  }
  for (const [key, list] of map) {
    map.set(
      key,
      [...list].sort((a, b) => a.sortOrder - b.sortOrder),
    );
  }
  return map;
}

export function ComponentsSplitView({
  bikeId,
  components,
  showEmptyCategories,
  categoriesUsed,
  wearByComponentId,
}: ComponentsSplitViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [mobileDialogOpen, setMobileDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<CategoryFormMode>(null);

  const componentsByCategory = useMemo(() => buildCategoryMap(components), [components]);
  const groups = useMemo(() => groupCategoriesBySystem(components), [components]);

  function handleSelectCategory(categoryId: string) {
    setFormMode(null);
    setSelectedCategoryId(categoryId);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileDialogOpen(true);
    }
  }

  function handleDialogOpenChange(open: boolean) {
    setMobileDialogOpen(open);
    if (!open) {
      setSelectedCategoryId(null);
      setFormMode(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start lg:gap-6">
        <ComponentsNav
          groups={groups}
          selectedCategoryId={selectedCategoryId}
          showEmptyCategories={showEmptyCategories}
          categoriesUsed={categoriesUsed}
          wearByComponentId={wearByComponentId}
          onSelectCategory={handleSelectCategory}
        />
        <CategoryDetailPanel
          bikeId={bikeId}
          selectedCategoryId={selectedCategoryId}
          componentsByCategory={componentsByCategory}
          formMode={formMode}
          onFormModeChange={setFormMode}
          wearByComponentId={wearByComponentId}
          className="hidden lg:block"
        />
      </div>

      <CategoryDetailDialog
        bikeId={bikeId}
        open={mobileDialogOpen}
        categoryId={selectedCategoryId}
        componentsByCategory={componentsByCategory}
        formMode={formMode}
        onFormModeChange={setFormMode}
        wearByComponentId={wearByComponentId}
        onOpenChange={handleDialogOpenChange}
      />
    </>
  );
}
