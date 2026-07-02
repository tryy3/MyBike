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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ComponentForm } from "./ComponentForm";
import { useActivateComponent, useDeleteComponent, useReorderComponents } from "./api";

interface CategorySectionProps {
  bikeId: string;
  categoryId: string;
  label: string;
  components: Component[];
}

export function CategorySection({ bikeId, categoryId, label, components }: CategorySectionProps) {
  const reorder = useReorderComponents(bikeId);
  const activate = useActivateComponent(bikeId);
  const deleteComponent = useDeleteComponent(bikeId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);
  const [deleting, setDeleting] = useState<Component | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sortable = components.length > 1;

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = components.findIndex((c) => c.id === active.id);
    const newIndex = components.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(components, oldIndex, newIndex);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge variant="outline" className="tabular-nums">
            {components.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {components.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No components in this category yet.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={components.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col divide-y">
                {components.map((c) => (
                  <ComponentRow
                    key={c.id}
                    component={c}
                    canActivate={components.length > 1}
                    draggable={sortable}
                    activating={activate.isPending}
                    onActivate={() => handleActivate(c)}
                    onEdit={() => setEditing(c)}
                    onDelete={() => setDeleting(c)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="w-full">
          <PlusIcon /> Add component
        </Button>
      </CardFooter>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {label.toLowerCase()} component</DialogTitle>
            <DialogDescription>Add a component you can swap into this category.</DialogDescription>
          </DialogHeader>
          <ComponentForm bikeId={bikeId} category={categoryId} onDone={() => setAdding(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit component</DialogTitle>
            <DialogDescription>
              Keep names short so they are easy to pick between.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ComponentForm
              bikeId={bikeId}
              category={categoryId}
              component={editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

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
    </Card>
  );
}

function ComponentRow({
  component,
  canActivate,
  draggable,
  activating,
  onActivate,
  onEdit,
  onDelete,
}: {
  component: Component;
  canActivate: boolean;
  draggable: boolean;
  activating: boolean;
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
      className="flex items-center justify-between gap-3 px-1 py-3"
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
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{component.name}</span>
            {component.isActive && (
              <Badge variant="secondary" className="gap-1">
                <CheckIcon className="size-3" aria-hidden="true" /> Active
              </Badge>
            )}
          </div>
          <span className="truncate text-sm text-muted-foreground">
            {[component.brand, component.model].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
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
