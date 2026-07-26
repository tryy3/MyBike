import { useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  Layers2Icon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getSystemGroup, type Component, type SystemGroupColorToken } from "shared";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  GROUP_ACCENT_BORDER_CLASS,
  GROUP_SELECTED_TINT_CLASS,
  GROUP_TEXT_CLASS,
} from "@/lib/system-group-styles";
import { cn } from "@/lib/utils";
import { componentBrandModel } from "./component-display";
import {
  ComponentDetailTier,
  ComponentIdentityTier,
  ComponentMetaLine,
  ComponentNameLabel,
  ComponentPropertiesPills,
} from "./component-list-layout";
import { ComponentForm } from "./ComponentForm";
import {
  useActivateComponent,
  useArchiveComponent,
  useDeleteComponent,
  useReorderComponents,
  useUnarchiveComponent,
} from "./api";
import type { WearByComponentId } from "./ComponentsSplitView";

export type CategoryFormMode = "add" | { edit: string } | null;

type RowPendingAction = "activate" | "archive" | "unarchive";

const PENDING_STATUS: Record<RowPendingAction, string> = {
  activate: "Switching…",
  archive: "Archiving…",
  unarchive: "Restoring…",
};

function resolveDisplayWear(
  component: Component,
  wearByComponentId?: WearByComponentId,
): { distanceMeters: number | null; movingTimeMinutes: number | null } {
  const fromStats = wearByComponentId?.get(component.id);
  if (fromStats) return fromStats;
  return {
    distanceMeters: component.distanceMeters,
    movingTimeMinutes: component.movingTimeMinutes,
  };
}

interface CategoryDetailContentProps {
  bikeId: string;
  categoryId: string;
  label: string;
  components: Component[];
  formMode: CategoryFormMode;
  onFormModeChange: (mode: CategoryFormMode) => void;
  wearByComponentId?: WearByComponentId;
}

export function CategoryDetailContent({
  bikeId,
  categoryId,
  label,
  components,
  formMode,
  onFormModeChange,
  wearByComponentId,
}: CategoryDetailContentProps) {
  const reorder = useReorderComponents(bikeId);
  const activate = useActivateComponent(bikeId);
  const archive = useArchiveComponent(bikeId);
  const unarchive = useUnarchiveComponent(bikeId);
  const deleteComponent = useDeleteComponent(bikeId);
  const [deleting, setDeleting] = useState<Component | null>(null);
  const [pendingById, setPendingById] = useState<Partial<Record<string, RowPendingAction>>>({});
  const [archivedOpen, setArchivedOpen] = useState(false);
  const anyRowPending = Object.keys(pendingById).length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sortable = components.length > 1;
  const sorted = [...components].sort((a, b) => a.sortOrder - b.sortOrder);
  const colorToken = getSystemGroup(categoryId)?.colorToken;
  const editingComponent =
    formMode && typeof formMode === "object"
      ? components.find((c) => c.id === formMode.edit)
      : undefined;

  function beginRowPending(componentId: string, action: RowPendingAction) {
    setPendingById((prev) => ({ ...prev, [componentId]: action }));
  }

  function endRowPending(componentId: string) {
    setPendingById((prev) => {
      if (!(componentId in prev)) return prev;
      const next = { ...prev };
      delete next[componentId];
      return next;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((c) => c.id === active.id);
    const newIndex = sorted.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    reorder.mutate(
      {
        category: categoryId,
        orderedIds: reordered.map((c) => c.id),
      },
      {
        onError: (e) => {
          toast.error("Could not reorder components", {
            description: e instanceof Error ? e.message : "Something went wrong",
          });
        },
      },
    );
  }

  async function handleActivate(component: Component) {
    beginRowPending(component.id, "activate");
    try {
      await activate.mutateAsync(component.id);
      toast.success(`Now using ${component.name}`);
    } catch (e: unknown) {
      toast.error("Could not switch component", {
        description: e instanceof Error ? e.message : "Something went wrong",
      });
    } finally {
      endRowPending(component.id);
    }
  }

  async function handleArchive(component: Component) {
    beginRowPending(component.id, "archive");
    try {
      await archive.mutateAsync(component.id);
      toast.success(`Archived ${component.name}`);
    } catch (e: unknown) {
      toast.error("Could not archive component", {
        description: e instanceof Error ? e.message : "Something went wrong",
      });
    } finally {
      endRowPending(component.id);
    }
  }

  async function handleUnarchive(component: Component) {
    beginRowPending(component.id, "unarchive");
    try {
      await unarchive.mutateAsync(component.id);
      toast.success(`Restored ${component.name}`);
    } catch (e: unknown) {
      toast.error("Could not unarchive component", {
        description: e instanceof Error ? e.message : "Something went wrong",
      });
    } finally {
      endRowPending(component.id);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteComponent.mutateAsync(deleting.id);
      toast.success("Component deleted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error("Could not delete component", { description: msg });
      throw e;
    }
  }

  if (formMode === "add") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Add {label.toLowerCase()} component</h3>
          <p className="text-sm text-muted-foreground">
            Add a component you can swap into this category.
          </p>
        </div>
        <ComponentForm
          bikeId={bikeId}
          category={categoryId}
          onDone={() => onFormModeChange(null)}
        />
      </div>
    );
  }

  if (editingComponent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Edit component</h3>
          <p className="text-sm text-muted-foreground">
            Keep names short so they are easy to pick between.
          </p>
        </div>
        <ComponentForm
          bikeId={bikeId}
          category={categoryId}
          component={editingComponent}
          onDone={() => onFormModeChange(null)}
        />
      </div>
    );
  }

  const activeComponents = sorted.filter((c) => c.isActive && !c.isArchived);
  const alternateComponents = sorted.filter((c) => !c.isActive && !c.isArchived);
  const archivedComponents = sorted.filter((c) => c.isArchived);

  return (
    <div className="flex flex-col gap-4">
      {components.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No components in this category yet.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-4">
              {activeComponents.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <StatusSectionHeader
                    icon={<CheckIcon className="size-3.5" aria-hidden="true" />}
                    label="Active"
                    emphasis="primary"
                    colorToken={colorToken}
                  />
                  <ul className="flex flex-col divide-y overflow-hidden rounded-lg border">
                    {activeComponents.map((c) => (
                      <ComponentRow
                        key={c.id}
                        component={c}
                        displayWear={resolveDisplayWear(c, wearByComponentId)}
                        canActivate={false}
                        canArchive={false}
                        canUnarchive={false}
                        draggable={sortable && !anyRowPending}
                        pending={pendingById[c.id] ?? null}
                        accentRail
                        colorToken={colorToken}
                        onActivate={() => void handleActivate(c)}
                        onArchive={() => void handleArchive(c)}
                        onUnarchive={() => void handleUnarchive(c)}
                        onEdit={() => onFormModeChange({ edit: c.id })}
                        onDelete={() => setDeleting(c)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {alternateComponents.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <StatusSectionHeader
                    icon={<Layers2Icon className="size-3.5" aria-hidden="true" />}
                    label="Alternates"
                    count={alternateComponents.length}
                    emphasis="secondary"
                  />
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {alternateComponents.map((c) => (
                      <ComponentRow
                        key={c.id}
                        component={c}
                        displayWear={resolveDisplayWear(c, wearByComponentId)}
                        canActivate={components.length > 1}
                        canArchive
                        canUnarchive={false}
                        draggable={sortable && !anyRowPending}
                        pending={pendingById[c.id] ?? null}
                        onActivate={() => void handleActivate(c)}
                        onArchive={() => void handleArchive(c)}
                        onUnarchive={() => void handleUnarchive(c)}
                        onEdit={() => onFormModeChange({ edit: c.id })}
                        onDelete={() => setDeleting(c)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {archivedComponents.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-1.5 self-start text-xs font-medium tracking-wide text-muted-foreground/80 uppercase transition-colors hover:text-muted-foreground"
                    aria-expanded={archivedOpen}
                    onClick={() => setArchivedOpen((open) => !open)}
                  >
                    <ChevronRightIcon
                      className={cn("size-3.5 transition-transform", archivedOpen && "rotate-90")}
                      aria-hidden="true"
                    />
                    <ArchiveIcon className="size-3.5" aria-hidden="true" />
                    <span>Archived</span>
                    <span className="font-normal tabular-nums">{archivedComponents.length}</span>
                  </button>
                  {archivedOpen ? (
                    <ul className="flex flex-col divide-y rounded-lg border border-dashed bg-muted/20">
                      {archivedComponents.map((c) => (
                        <ComponentRow
                          key={c.id}
                          component={c}
                          displayWear={resolveDisplayWear(c, wearByComponentId)}
                          canActivate={false}
                          canArchive={false}
                          canUnarchive
                          draggable={sortable && !anyRowPending}
                          pending={pendingById[c.id] ?? null}
                          muted
                          onActivate={() => void handleActivate(c)}
                          onArchive={() => void handleArchive(c)}
                          onUnarchive={() => void handleUnarchive(c)}
                          onEdit={() => onFormModeChange({ edit: c.id })}
                          onDelete={() => setDeleting(c)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onFormModeChange("add")}
        className="w-full"
        disabled={anyRowPending}
      >
        <PlusIcon /> Add component
      </Button>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete component?"
        description={
          deleting
            ? `"${deleting.name}" will be permanently removed. Prefer archive for retired parts.`
            : ""
        }
        confirmLabel="Delete"
        loading={deleteComponent.isPending}
        loadingLabel="Deleting…"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function StatusSectionHeader({
  icon,
  label,
  count,
  emphasis,
  colorToken,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  emphasis: "primary" | "secondary";
  colorToken?: SystemGroupColorToken;
}) {
  return (
    <h4
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase",
        emphasis === "primary"
          ? colorToken
            ? GROUP_TEXT_CLASS[colorToken]
            : "text-primary"
          : "text-muted-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined ? (
        <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </h4>
  );
}

function ComponentRow({
  component,
  displayWear,
  canActivate,
  canArchive,
  canUnarchive,
  draggable,
  pending,
  accentRail,
  colorToken,
  muted,
  onActivate,
  onArchive,
  onUnarchive,
  onEdit,
  onDelete,
}: {
  component: Component;
  displayWear: { distanceMeters: number | null; movingTimeMinutes: number | null };
  canActivate: boolean;
  canArchive: boolean;
  canUnarchive: boolean;
  draggable: boolean;
  pending: RowPendingAction | null;
  accentRail?: boolean;
  colorToken?: SystemGroupColorToken;
  muted?: boolean;
  onActivate: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: component.id,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const rowBusy = pending !== null;
  const statusLabel = pending ? PENDING_STATUS[pending] : null;

  return (
    <li
      ref={setNodeRef}
      style={style}
      aria-busy={rowBusy || undefined}
      className={cn(
        "flex items-start justify-between gap-3 px-3 py-3",
        accentRail && "border-l-[3px]",
        accentRail &&
          (colorToken
            ? [GROUP_ACCENT_BORDER_CLASS[colorToken], GROUP_SELECTED_TINT_CLASS[colorToken]]
            : "border-l-primary bg-muted/40"),
        muted && "text-muted-foreground",
        rowBusy && "opacity-70",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {draggable && (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground/60 transition-colors hover:text-muted-foreground active:cursor-grabbing"
            aria-label={`Drag to reorder ${component.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" aria-hidden="true" />
          </button>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <ComponentIdentityTier separated={Boolean(component.notes?.trim())}>
            <ComponentNameLabel>{component.name}</ComponentNameLabel>
            <ComponentMetaLine
              brandModel={componentBrandModel(component)}
              distanceMeters={displayWear.distanceMeters}
              movingTimeMinutes={displayWear.movingTimeMinutes}
            />
            <ComponentPropertiesPills
              category={component.category}
              properties={component.properties}
            />
          </ComponentIdentityTier>
          {statusLabel ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {statusLabel}
            </p>
          ) : (
            <ComponentDetailTier notes={component.notes} lineClamp={3} />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {canActivate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={rowBusy}
            onClick={onActivate}
            aria-label={
              pending === "activate"
                ? `Switching to ${component.name}`
                : `Switch to ${component.name}`
            }
            aria-busy={pending === "activate" || undefined}
          >
            {pending === "activate" ? (
              <>
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
                Switching…
              </>
            ) : (
              "Use this"
            )}
          </Button>
        ) : null}
        {canArchive ? (
          <IconActionButton
            label={
              pending === "archive" ? `Archiving ${component.name}` : `Archive ${component.name}`
            }
            tooltip={pending === "archive" ? "Archiving…" : "Archive"}
            disabled={rowBusy}
            pending={pending === "archive"}
            onClick={onArchive}
          >
            <ArchiveIcon />
          </IconActionButton>
        ) : null}
        {canUnarchive ? (
          <IconActionButton
            label={
              pending === "unarchive"
                ? `Restoring ${component.name}`
                : `Unarchive ${component.name}`
            }
            tooltip={pending === "unarchive" ? "Restoring…" : "Unarchive"}
            disabled={rowBusy}
            pending={pending === "unarchive"}
            onClick={onUnarchive}
          >
            <ArchiveRestoreIcon />
          </IconActionButton>
        ) : null}
        <IconActionButton
          label={`Edit ${component.name}`}
          tooltip="Edit"
          disabled={rowBusy}
          onClick={onEdit}
        >
          <PencilIcon />
        </IconActionButton>
        <IconActionButton
          label={`Delete ${component.name}`}
          tooltip="Delete"
          disabled={rowBusy}
          onClick={onDelete}
        >
          <Trash2Icon />
        </IconActionButton>
      </div>
    </li>
  );
}

function IconActionButton({
  label,
  tooltip,
  children,
  pending = false,
  ...props
}: {
  label: string;
  tooltip: string;
  children: ReactNode;
  pending?: boolean;
} & Omit<ComponentProps<typeof Button>, "size" | "variant" | "children" | "aria-label">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={label}
          aria-busy={pending || undefined}
          {...props}
        >
          {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
