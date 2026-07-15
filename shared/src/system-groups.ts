import type { Component } from "./schemas/component.js";
import { CATEGORIES, type CategoryDef } from "./categories.js";

export type SystemGroupColorToken =
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "chart-6"
  | "chart-7";

export interface SystemGroupDef {
  id: string;
  label: string;
  order: number;
  categoryIds: readonly string[];
  colorToken: SystemGroupColorToken;
}

export const SYSTEM_GROUPS: readonly SystemGroupDef[] = [
  {
    id: "frame-structure",
    label: "Frame & structure",
    order: 10,
    categoryIds: ["frame", "fork", "headset"],
    colorToken: "chart-1",
  },
  {
    id: "cockpit",
    label: "Cockpit",
    order: 20,
    categoryIds: ["handlebar", "stem", "bar-tape", "shift-levers", "brake-levers"],
    colorToken: "chart-2",
  },
  {
    id: "drivetrain",
    label: "Drivetrain",
    order: 30,
    categoryIds: [
      "front-derailleur",
      "rear-derailleur",
      "crankset",
      "bottom-bracket",
      "cassette",
      "chain",
    ],
    colorToken: "chart-3",
  },
  {
    id: "braking",
    label: "Braking",
    order: 40,
    categoryIds: ["brakes"],
    colorToken: "chart-4",
  },
  {
    id: "wheels-tires",
    label: "Wheels & tires",
    order: 50,
    categoryIds: ["front-wheel", "rear-wheel", "hubs", "rims", "spokes", "front-tire", "rear-tire"],
    colorToken: "chart-5",
  },
  {
    id: "contact-points",
    label: "Contact points",
    order: 60,
    categoryIds: ["saddle", "seatpost", "pedals"],
    colorToken: "chart-6",
  },
  {
    id: "other",
    label: "Other",
    order: 70,
    categoryIds: ["other"],
    colorToken: "chart-7",
  },
] as const;

const categoryToGroup = new Map<string, SystemGroupDef>(
  SYSTEM_GROUPS.flatMap((group) => group.categoryIds.map((id) => [id, group] as const)),
);

export function getSystemGroup(categoryId: string): SystemGroupDef | undefined {
  return categoryToGroup.get(categoryId);
}

export interface CategoryWithComponents {
  category: CategoryDef;
  group: SystemGroupDef;
  components: Component[];
}

export interface SystemGroupNav {
  group: SystemGroupDef;
  categories: CategoryWithComponents[];
}

function sortComponents(components: Component[]): Component[] {
  return [...components].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Build nav structure: system groups → categories → components (sorted). */
export function groupCategoriesBySystem(components: Component[]): SystemGroupNav[] {
  const byCategory = new Map<string, Component[]>();
  for (const c of components) {
    const list = byCategory.get(c.category);
    if (list) list.push(c);
    else byCategory.set(c.category, [c]);
  }

  return SYSTEM_GROUPS.map((group) => ({
    group,
    categories: CATEGORIES.filter((cat) => group.categoryIds.includes(cat.id)).map((category) => ({
      category,
      group,
      components: sortComponents(byCategory.get(category.id) ?? []),
    })),
  }));
}

export function getActiveComponent(components: Component[]): Component | undefined {
  return components.find((c) => c.isActive) ?? components[0];
}

export interface MaintenanceTaskGroupable {
  kind: string;
  componentCategory: string | null;
  status: string;
  sortOrder: number;
}

export interface SystemGroupTasks<T extends MaintenanceTaskGroupable> {
  group: SystemGroupDef;
  tasks: T[];
}

function compareMaintenanceTasks<T extends MaintenanceTaskGroupable>(a: T, b: T): number {
  const rank = (task: T) => {
    if (task.status === "due" || task.status === "overdue") return 0;
    if (task.status === "snoozed") return 1;
    return 2;
  };
  const byStatus = rank(a) - rank(b);
  if (byStatus !== 0) return byStatus;
  return a.sortOrder - b.sortOrder;
}

/** Group periodic/EOL maintenance tasks by bike subsystem (touch-ups excluded). */
export function groupMaintenanceTasksBySystem<T extends MaintenanceTaskGroupable>(
  tasks: readonly T[],
): SystemGroupTasks<T>[] {
  const byGroupId = new Map<string, T[]>();

  for (const task of tasks) {
    if (task.kind === "touch_up") continue;
    const group = task.componentCategory ? getSystemGroup(task.componentCategory) : undefined;
    const groupId = group?.id ?? "other";
    const list = byGroupId.get(groupId) ?? [];
    list.push(task);
    byGroupId.set(groupId, list);
  }

  const result: SystemGroupTasks<T>[] = [];
  for (const group of SYSTEM_GROUPS) {
    const groupTasks = byGroupId.get(group.id);
    if (!groupTasks || groupTasks.length === 0) continue;
    groupTasks.sort(compareMaintenanceTasks);
    result.push({ group, tasks: groupTasks });
  }
  return result;
}

export function groupHasDueMaintenanceTasks<T extends { status: string }>(
  tasks: readonly T[],
): boolean {
  return tasks.some((task) => task.status === "due" || task.status === "overdue");
}
