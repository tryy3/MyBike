import type { SystemGroupColorToken, SystemGroupNav } from "shared";
import { getActiveComponent } from "shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { componentBrandModel } from "./component-display";

const GROUP_DOT_CLASS: Record<SystemGroupColorToken, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
  "chart-6": "bg-chart-6",
  "chart-7": "bg-chart-7",
};

const GROUP_SELECTED_TINT_CLASS: Record<SystemGroupColorToken, string> = {
  "chart-1": "bg-chart-1/15",
  "chart-2": "bg-chart-2/15",
  "chart-3": "bg-chart-3/15",
  "chart-4": "bg-chart-4/15",
  "chart-5": "bg-chart-5/15",
  "chart-6": "bg-chart-6/15",
  "chart-7": "bg-chart-7/15",
};

const GROUP_HOVER_TINT_CLASS: Record<SystemGroupColorToken, string> = {
  "chart-1": "hover:bg-chart-1/10",
  "chart-2": "hover:bg-chart-2/10",
  "chart-3": "hover:bg-chart-3/10",
  "chart-4": "hover:bg-chart-4/10",
  "chart-5": "hover:bg-chart-5/10",
  "chart-6": "hover:bg-chart-6/10",
  "chart-7": "hover:bg-chart-7/10",
};

interface ComponentsNavProps {
  groups: SystemGroupNav[];
  selectedCategoryId: string | null;
  showEmptyCategories: boolean;
  categoriesUsed: number;
  onSelectCategory: (categoryId: string) => void;
}

export function ComponentsNav({
  groups,
  selectedCategoryId,
  showEmptyCategories,
  categoriesUsed,
  onSelectCategory,
}: ComponentsNavProps) {
  return (
    <nav aria-label="Component categories" className="flex flex-col gap-6">
      {groups.map(({ group, categories }) => {
        const visible = categories.filter(
          (entry) => showEmptyCategories || categoriesUsed === 0 || entry.components.length > 0,
        );
        if (visible.length === 0) return null;

        const filledCount = visible.filter((e) => e.components.length > 0).length;

        return (
          <section key={group.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 px-1">
              <span
                className={cn("size-3.5 shrink-0 rounded-full", GROUP_DOT_CLASS[group.colorToken])}
                aria-hidden="true"
              />
              <h3 className="text-sm font-medium">{group.label}</h3>
              {filledCount > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {filledCount} filled
                </span>
              ) : null}
            </div>
            <ul className="flex flex-col">
              {visible.map(({ category, components }) => {
                const active = getActiveComponent(components);
                const alternateCount = Math.max(0, components.length - 1);
                const selected = selectedCategoryId === category.id;
                const brandModel = active ? componentBrandModel(active) : null;

                return (
                  <li key={category.id}>
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => onSelectCategory(category.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                        GROUP_HOVER_TINT_CLASS[group.colorToken],
                        selected && GROUP_SELECTED_TINT_CLASS[group.colorToken],
                        selected ? "border-ring ring-2 ring-ring/30" : "border-transparent",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 shrink-0 self-stretch rounded-full",
                          GROUP_DOT_CLASS[group.colorToken],
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">{category.label}</span>
                        {active ? (
                          <>
                            <span className="truncate text-sm">{active.name}</span>
                            {brandModel ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {brandModel}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="truncate text-xs text-muted-foreground">
                            No parts yet
                          </span>
                        )}
                      </div>
                      {alternateCount > 0 ? (
                        <Badge variant="outline" className="shrink-0 tabular-nums">
                          +{alternateCount}
                        </Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
