import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import type { ComponentOption, SlotWithOptions } from "shared";

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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OptionForm } from "./OptionForm";
import {
  useActivateOption,
  useDeleteOption,
  useDeleteSlot,
  useUpdateSlot,
} from "./api";

interface SlotCardProps {
  bikeId: string;
  slot: SlotWithOptions;
}

export function SlotCard({ bikeId, slot }: SlotCardProps) {
  const deleteSlot = useDeleteSlot(bikeId);
  const [renaming, setRenaming] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{slot.name}</CardTitle>
          <div className="flex gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Rename slot"
              onClick={() => setRenaming(true)}
            >
              <PencilIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete slot"
              onClick={() => setDeletingSlot(true)}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {slot.options.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No options yet. Add the parts that fit this slot, then pick which is
            currently mounted.
          </p>
        ) : (
          <ul className="flex flex-col">
            {slot.options.map((opt, i) => (
              <div key={opt.id}>
                {i > 0 && <Separator />}
                <OptionRow
                  bikeId={bikeId}
                  option={opt}
                  canActivate={slot.options.length > 1}
                />
              </div>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <AddOptionButton bikeId={bikeId} slotId={slot.id} />
      </CardFooter>

      <SlotRenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        bikeId={bikeId}
        slot={slot}
      />

      <ConfirmDialog
        open={deletingSlot}
        onOpenChange={setDeletingSlot}
        title="Delete component slot?"
        description={
          `"${slot.name}" and its ${slot.options.length} option(s) will be removed.`
        }
        confirmLabel="Delete slot"
        loading={deleteSlot.isPending}
        onConfirm={() =>
          deleteSlot.mutateAsync(slot.id).then(() => {
            toast.success("Slot deleted");
            setDeletingSlot(false);
          })
        }
      />
    </Card>
  );
}

function OptionRow({
  bikeId,
  option,
  canActivate,
}: {
  bikeId: string;
  option: ComponentOption;
  canActivate: boolean;
}) {
  const activate = useActivateOption(bikeId);
  const deleteOption = useDeleteOption(bikeId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 px-1 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{option.name}</span>
          {option.isActive && (
            <Badge variant="secondary" className="gap-1">
              <CheckIcon className="size-3" /> Active
            </Badge>
          )}
        </div>
        <span className="truncate text-sm text-muted-foreground">
          {[option.brand, option.model].filter(Boolean).join(" · ") || "—"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canActivate && !option.isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => activate.mutate(option.id)}
            aria-label={`Switch to ${option.name}`}
          >
            Use this
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Edit option"
          onClick={() => setEditing(true)}
        >
          <PencilIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Delete option"
          onClick={() => setDeleting(true)}
        >
          <Trash2Icon />
        </Button>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit option</DialogTitle>
            <DialogDescription>
              Keep names short so they are easy to pick between.
            </DialogDescription>
          </DialogHeader>
          <OptionForm
            bikeId={bikeId}
            slotId={option.slotId}
            option={option}
            onDone={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete option?"
        description={`"${option.name}" will be removed from this slot.`}
        confirmLabel="Delete"
        loading={deleteOption.isPending}
        onConfirm={() =>
          deleteOption.mutateAsync(option.id).then(() => {
            toast.success("Option deleted");
            setDeleting(false);
          })
        }
      />
    </li>
  );
}

function AddOptionButton({
  bikeId,
  slotId,
}: {
  bikeId: string;
  slotId: string;
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
        <PlusIcon /> Add option
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add option</DialogTitle>
            <DialogDescription>
              Add a component you can swap into this slot.
            </DialogDescription>
          </DialogHeader>
          <OptionForm
            bikeId={bikeId}
            slotId={slotId}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function SlotRenameDialog({
  open,
  onOpenChange,
  bikeId,
  slot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bikeId: string;
  slot: SlotWithOptions;
}) {
  const updateSlot = useUpdateSlot(bikeId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = (inputRef.current?.value ?? "").trim();
    if (trimmed.length === 0) {
      setError("Name is required");
      return;
    }
    setError(null);
    updateSlot
      .mutateAsync({ id: slot.id, data: { name: trimmed } })
      .then(() => {
        toast.success("Slot renamed");
        onOpenChange(false);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Could not rename slot";
        setError(msg);
      });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename slot</DialogTitle>
          <DialogDescription>
            {"e.g. Wheelset, Chain, Brakes"}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="slot-name">Name</FieldLabel>
            <Input
              id="slot-name"
              ref={inputRef}
              defaultValue={slot.name}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
        </FieldGroup>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={updateSlot.isPending} onClick={submit}>
            {updateSlot.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}