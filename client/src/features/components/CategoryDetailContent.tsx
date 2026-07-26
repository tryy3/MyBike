import { useState } from "react";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  GripVerticalIcon,
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
import type { Component } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { componentBrandModel } from "./component-display";
import {
  ComponentDetailTier,
  ComponentIdentityTier,
  ComponentMetaLine,
  ComponentNameLabel,
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sortable = components.length > 1;
  const sorted = [...components].sort((a, b) => a.sortOrder - b.sortOrder);
  const editingComponent =
    formMode && typeof formMode === "object"
      ? components.find((c) => c.id === formMode.edit)
      : undefined;

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

  function handleActivate(component: Component) {
    activate.mutate(component.id, {
      onSuccess: () => {
        toast.success(`Now using ${component.name}`);
      },
      onError: (e) => {
        toast.error("Could not switch component", {
          description: e instanceof Error ? e.message : "Something went wrong",
        });
      },
    });
  }

  function handleArchive(component: Component) {
    archive.mutate(component.id, {
      onSuccess: () => {
        toast.success(`Archived ${component.name}`);
      },
      onError: (e) => {
        toast.error("Could not archive component", {
          description: e instanceof Error ? e.message : "Something went wrong",
        });
      },
    });
  }

  function handleUnarchive(component: Component) {
    unarchive.mutate(component.id, {
      onSuccess: () => {
        toast.success(`Restored ${component.name}`);
      },
      onError: (e) => {
        toast.error("Could not unarchive component", {
          description: e instanceof Error ? e.message : "Something went wrong",
        });
      },
    });
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
  const busy =
    activate.isPending || archive.isPending || unarchive.isPending || deleteComponent.isPending;

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
                  <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Active
                  </h4>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {activeComponents.map((c) => (
                      <ComponentRow
                        key={c.id}
                        component={c}
                        displayWear={resolveDisplayWear(c, wearByComponentId)}
                        canActivate={false}
                        canArchive={false}
                        canUnarchive={false}
                        draggable={sortable}
                        busy={busy}
                        highlighted
                        onActivate={() => handleActivate(c)}
                        onArchive={() => handleArchive(c)}
                        onUnarchive={() => handleUnarchive(c)}
                        onEdit={() => onFormModeChange({ edit: c.id })}
                        onDelete={() => setDeleting(c)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {alternateComponents.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Alternates
                  </h4>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {alternateComponents.map((c) => (
                      <ComponentRow
                        key={c.id}
                        component={c}
                        displayWear={resolveDisplayWear(c, wearByComponentId)}
                        canActivate={components.length > 1}
                        canArchive
                        canUnarchive={false}
                        draggable={sortable}
                        busy={busy}
                        onActivate={() => handleActivate(c)}
                        onArchive={() => handleArchive(c)}
                        onUnarchive={() => handleUnarchive(c)}
                        onEdit={() => onFormModeChange({ edit: c.id })}
                        onDelete={() => setDeleting(c)}
                      />
                    ))}
                  </ul>
                </section>
              ) : null}

              {archivedComponents.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Archived
                  </h4>
                  <ul className="flex flex-col divide-y rounded-lg border border-dashed bg-muted/20">
                    {archivedComponents.map((c) => (
                      <ComponentRow
                        key={c.id}
                        component={c}
                        displayWear={resolveDisplayWear(c, wearByComponentId)}
                        canActivate={false}
                        canArchive={false}
                        canUnarchive
                        draggable={sortable}
                        busy={busy}
                        muted
                        onActivate={() => handleActivate(c)}
                        onArchive={() => handleArchive(c)}
                        onUnarchive={() => handleUnarchive(c)}
                        onEdit={() => onFormModeChange({ edit: c.id })}
                        onDelete={() => setDeleting(c)}
                      />
                    ))}
                  </ul>
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

function ComponentRow({
  component,
  displayWear,
  canActivate,
  canArchive,
  canUnarchive,
  draggable,
  busy,
  highlighted,
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
  busy: boolean;
  highlighted?: boolean;
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

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start justify-between gap-3 px-3 py-3",
        highlighted && "bg-muted/40",
        muted && "text-muted-foreground",
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
            <div className="flex items-center gap-2">
              <ComponentNameLabel>{component.name}</ComponentNameLabel>
              {component.isActive ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckIcon className="size-3" aria-hidden="true" /> Active
                </Badge>
              ) : null}
              {component.isArchived ? (
                <Badge variant="outline" className="gap-1">
                  <ArchiveIcon className="size-3" aria-hidden="true" /> Archived
                </Badge>
              ) : null}
            </div>
            <ComponentMetaLine
              brandModel={componentBrandModel(component)}
              distanceMeters={displayWear.distanceMeters}
              movingTimeMinutes={displayWear.movingTimeMinutes}
            />
          </ComponentIdentityTier>
          <ComponentDetailTier notes={component.notes} lineClamp={3} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {canActivate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onActivate}
            aria-label={`Switch to ${component.name}`}
          >
            Use this
          </Button>
        ) : null}
        {canArchive ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Archive ${component.name}`}
            onClick={onArchive}
          >
            <ArchiveIcon />
          </Button>
        ) : null}
        {canUnarchive ? (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Unarchive ${component.name}`}
            onClick={onUnarchive}
          >
            <ArchiveRestoreIcon />
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Edit ${component.name}`}
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${component.name}`}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}
