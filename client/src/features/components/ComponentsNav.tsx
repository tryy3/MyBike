import type { SystemGroupNav } from "shared";
import { getActiveComponent } from "shared";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  GROUP_DOT_CLASS,
  GROUP_HOVER_TINT_CLASS,
  GROUP_SELECTED_TINT_CLASS,
} from "@/lib/system-group-styles";
import { cn } from "@/lib/utils";
import { TriangleAlertIcon } from "lucide-react";
import type { MaintenanceTaskGql } from "@/lib/graphql/operations";
import { bikeTabPaths } from "@/routes/bike-routes";
import { componentBrandModel } from "./component-display";
import {
  ComponentDetailTier,
  ComponentCategoryLabel,
  ComponentIdentityTier,
  ComponentMetaLine,
  ComponentNameLabel,
} from "./component-list-layout";
import type { WearByComponentId } from "./ComponentsSplitView";

interface ComponentsNavProps {
  bikeId: string;
  groups: SystemGroupNav[];
  selectedCategoryId: string | null;
  showEmptyCategories: boolean;
  categoriesUsed: number;
  wearByComponentId?: WearByComponentId;
  maintenanceAlertByCategory?: Map<string, number>;
  dueTasksByCategory?: Map<string, MaintenanceTaskGql[]>;
  onSelectCategory: (categoryId: string) => void;
}

function maintenanceTaskKindLabel(kind: MaintenanceTaskGql["kind"]): string {
  if (kind === "eol") return "Replace";
  return "Service";
}

function MaintenanceAlertLink({
  bikeId,
  categoryId,
  alertCount,
  dueTasks,
}: {
  bikeId: string;
  categoryId: string;
  alertCount: number;
  dueTasks: MaintenanceTaskGql[];
}) {
  const tooltipContent =
    dueTasks.length > 0 ? (
      <ul className="flex flex-col gap-1">
        {dueTasks.map((task) => (
          <li key={task.id}>
            <span className="font-medium">{maintenanceTaskKindLabel(task.kind)}:</span> {task.title}
          </li>
        ))}
      </ul>
    ) : (
      "View due maintenance tasks"
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={bikeTabPaths.maintenance}
          params={{ bikeId }}
          search={{ category: categoryId }}
          className="flex shrink-0 cursor-pointer items-center self-center rounded-md px-1 py-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${alertCount} due maintenance task${alertCount === 1 ? "" : "s"} — open maintenance`}
        >
          <Badge variant="destructive" className="tabular-nums pt-0.5">
            <TriangleAlertIcon className="size-3" aria-hidden="true" />
            {alertCount}
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}

export function ComponentsNav({
  bikeId,
  groups,
  selectedCategoryId,
  showEmptyCategories,
  categoriesUsed,
  wearByComponentId,
  maintenanceAlertByCategory,
  dueTasksByCategory,
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
                const displayWear = active
                  ? (wearByComponentId?.get(active.id) ?? {
                      distanceMeters: active.distanceMeters,
                      movingTimeMinutes: active.movingTimeMinutes,
                    })
                  : null;

                const alertCount = maintenanceAlertByCategory?.get(category.id) ?? 0;
                const dueTasks = dueTasksByCategory?.get(category.id) ?? [];

                return (
                  <li key={category.id} className="flex items-stretch gap-0.5">
                    <button
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => onSelectCategory(category.id)}
                      className={cn(
                        "flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
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
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        {active ? (
                          <>
                            <ComponentIdentityTier separated={Boolean(active.notes?.trim())}>
                              <ComponentCategoryLabel>{category.label}</ComponentCategoryLabel>
                              <ComponentNameLabel>{active.name}</ComponentNameLabel>
                              <ComponentMetaLine
                                brandModel={brandModel}
                                distanceMeters={displayWear?.distanceMeters}
                                movingTimeMinutes={displayWear?.movingTimeMinutes}
                              />
                            </ComponentIdentityTier>
                            <ComponentDetailTier notes={active.notes} lineClamp={2} />
                          </>
                        ) : (
                          <>
                            <ComponentCategoryLabel>{category.label}</ComponentCategoryLabel>
                            <span className="truncate text-xs text-muted-foreground">
                              No parts yet
                            </span>
                          </>
                        )}
                      </div>
                      {alternateCount > 0 ? (
                        <Badge variant="outline" className="shrink-0 tabular-nums pt-0.5">
                          +{alternateCount}
                        </Badge>
                      ) : null}
                    </button>
                    {alertCount > 0 ? (
                      <MaintenanceAlertLink
                        bikeId={bikeId}
                        categoryId={category.id}
                        alertCount={alertCount}
                        dueTasks={dueTasks}
                      />
                    ) : null}
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
