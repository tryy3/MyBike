import { useState } from "react";
import { toast } from "sonner";
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import type { Component } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ComponentForm } from "./ComponentForm";
import {
  useActivateComponent,
  useDeleteComponent,
} from "./api";

interface CategorySectionProps {
  bikeId: string;
  categoryId: string;
  label: string;
  components: Component[];
}

export function CategorySection({
  bikeId,
  categoryId,
  label,
  components,
}: CategorySectionProps) {
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
          <ul className="flex flex-col">
            {components.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <Separator />}
                <ComponentRow
                  bikeId={bikeId}
                  categoryId={categoryId}
                  component={c}
                  canActivate={components.length > 1}
                />
              </div>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <AddComponentButton
          bikeId={bikeId}
          categoryId={categoryId}
          label={label}
        />
      </CardFooter>
    </Card>
  );
}

function ComponentRow({
  bikeId,
  categoryId,
  component,
  canActivate,
}: {
  bikeId: string;
  categoryId: string;
  component: Component;
  canActivate: boolean;
}) {
  const activate = useActivateComponent(bikeId);
  const deleteComponent = useDeleteComponent(bikeId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 px-1 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{component.name}</span>
          {component.isActive && (
            <Badge variant="secondary" className="gap-1">
              <CheckIcon className="size-3" /> Active
            </Badge>
          )}
        </div>
        <span className="truncate text-sm text-muted-foreground">
          {[component.brand, component.model].filter(Boolean).join(" · ") ||
            "—"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canActivate && !component.isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => activate.mutate(component.id)}
            aria-label={`Switch to ${component.name}`}
          >
            Use this
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Edit component"
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete component"
          onClick={() => setDeleting(true)}
        >
          <Trash2Icon />
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit component</DialogTitle>
            <DialogDescription>
              Keep names short so they are easy to pick between.
            </DialogDescription>
          </DialogHeader>
          <ComponentForm
            bikeId={bikeId}
            category={categoryId}
            component={component}
            onDone={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete component?"
        description={`"${component.name}" will be removed from this category.`}
        confirmLabel="Delete"
        loading={deleteComponent.isPending}
        onConfirm={() =>
          deleteComponent.mutateAsync(component.id).then(() => {
            toast.success("Component deleted");
            setDeleting(false);
          })
        }
      />
    </li>
  );
}

function AddComponentButton({
  bikeId,
  categoryId,
  label,
}: {
  bikeId: string;
  categoryId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full"
      >
        <PlusIcon /> Add component
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {label.toLowerCase()} component</DialogTitle>
            <DialogDescription>
              Add a component you can swap into this category.
            </DialogDescription>
          </DialogHeader>
          <ComponentForm
            bikeId={bikeId}
            category={categoryId}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}