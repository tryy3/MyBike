import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { useActivateComponent, useDeleteComponent, useReorderComponents } from "./api";
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

  const hasActive = sorted.some((c) => c.isActive);
  const hasAlternates = sorted.some((c) => !c.isActive);

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
              {hasActive ? (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Active
                  </h4>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {sorted
                      .filter((c) => c.isActive)
                      .map((c) => (
                        <ComponentRow
                          key={c.id}
                          component={c}
                          displayWear={resolveDisplayWear(c, wearByComponentId)}
                          canActivate={false}
                          draggable={sortable}
                          activating={activate.isPending}
                          highlighted
                          onActivate={() => handleActivate(c)}
                          onEdit={() => onFormModeChange({ edit: c.id })}
                          onDelete={() => setDeleting(c)}
                        />
                      ))}
                  </ul>
                </section>
              ) : null}

              {hasAlternates ? (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Alternates
                  </h4>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {sorted
                      .filter((c) => !c.isActive)
                      .map((c) => (
                        <ComponentRow
                          key={c.id}
                          component={c}
                          displayWear={resolveDisplayWear(c, wearByComponentId)}
                          canActivate={components.length > 1}
                          draggable={sortable}
                          activating={activate.isPending}
                          onActivate={() => handleActivate(c)}
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
        description={deleting ? `"${deleting.name}" will be removed from this category.` : ""}
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
  draggable,
  activating,
  highlighted,
  onActivate,
  onEdit,
  onDelete,
}: {
  component: Component;
  displayWear: { distanceMeters: number | null; movingTimeMinutes: number | null };
  canActivate: boolean;
  draggable: boolean;
  activating: boolean;
  highlighted?: boolean;
  onActivate: () => void;
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
              {component.isActive && (
                <Badge variant="secondary" className="gap-1">
                  <CheckIcon className="size-3" aria-hidden="true" /> Active
                </Badge>
              )}
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
        {canActivate && !component.isActive && (
          <Button
            size="sm"
            variant="outline"
            disabled={activating}
            onClick={onActivate}
            aria-label={`Switch to ${component.name}`}
          >
            Use this
          </Button>
        )}
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
