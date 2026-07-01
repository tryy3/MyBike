import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Empty } from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BikeForm } from "@/features/bikes/BikeForm";
import { useBike, useDeleteBike } from "@/features/bikes/api";
import { SlotCard } from "@/features/components/SlotCard";
import { useCreateSlot } from "@/features/components/api";

interface BikeDetailPageProps {
  bikeId: string;
}

export function BikeDetailPage({ bikeId }: BikeDetailPageProps) {
  const { data, isPending, isError, error } = useBike(bikeId);
  const deleteBike = useDeleteBike();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isPending) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading bike…
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="text-sm text-destructive">
            Could not load this bike: {error?.message ?? "Not found"}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to bikes</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="w-max text-muted-foreground"
      >
        <Link to="/">
          <ArrowLeftIcon /> Back to bikes
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-2xl">{data.name}</CardTitle>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {[data.brand, data.model, data.year].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Edit bike"
                onClick={() => setEditing(true)}
              >
                <PencilIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete bike"
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        </CardHeader>
        {data.notes && (
          <CardContent>
            <Separator className="mb-4" />
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {data.notes}
            </p>
          </CardContent>
        )}
      </Card>

      <Tabs defaultValue="components">
        <TabsList>
          <TabsTrigger value="components">
            Components
            <Badge variant="secondary" className="ml-2">
              {data.slots.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {data.slots.length} slot{data.slots.length === 1 ? "" : "s"}
            </h2>
            <AddSlotDialog bikeId={bikeId} />
          </div>
          {data.slots.length === 0 ? (
            <Empty className="min-h-48 border">
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-col gap-1 text-center">
                  <p className="font-medium">No components yet</p>
                  <p className="text-sm text-muted-foreground">
                    Add component slots like “Wheelset”, “Drivetrain”, or
                    “Brakes”, then track what is mounted.
                  </p>
                </div>
                <AddSlotDialog bikeId={bikeId} />
              </div>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.slots.map((slot) => (
                <SlotCard key={slot.id} bikeId={bikeId} slot={slot} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bike overview</CardTitle>
              <CardDescription>
                Snapshot of {data.name} and its setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <OverviewRow label="Slots">
                {data.slots.length}
              </OverviewRow>
              <OverviewRow label="Total options">
                {data.slots.reduce((n, s) => n + s.options.length, 0)}
              </OverviewRow>
              <OverviewRow label="Active components">
                {data.slots.reduce((n, s) => n + (s.options.some((o) => o.isActive) ? 1 : 0), 0)}
              </OverviewRow>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit bike dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit bike</DialogTitle>
            <DialogDescription>Update this bike's details.</DialogDescription>
          </DialogHeader>
          <BikeForm
            bike={data}
            bikeId={data.id}
            onDone={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete bike dialog */}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete bike?"
        description={`"${data.name}" and all of its components will be permanently deleted.`}
        confirmLabel="Delete bike"
        loading={deleteBike.isPending}
        onConfirm={() =>
          deleteBike.mutateAsync(data.id).then(() => {
            toast.success("Bike deleted");
          })
        }
      />
    </div>
  );
}

function OverviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}

function AddSlotDialog({ bikeId }: { bikeId: string }) {
  const createSlot = useCreateSlot(bikeId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = (inputRef.current?.value ?? "").trim();
    if (trimmed.length === 0) {
      setError("Name is required");
      return;
    }
    setError(null);
    createSlot
      .mutateAsync({ name: trimmed })
      .then(() => {
        toast.success("Slot added");
        setOpen(false);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Could not add slot";
        setError(msg);
      });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> Add component slot
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add component slot</DialogTitle>
            <DialogDescription>
              Group interchangeable parts, e.g. “Wheelset”, “Drivetrain”.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="slot-name">Name</FieldLabel>
              <Input
                id="slot-name"
                ref={inputRef}
                // defaultValue="" starts fresh since Dialog remounts content.
                defaultValue=""
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="e.g. Wheelset"
                aria-invalid={!!error}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createSlot.isPending}
              onClick={submit}
            >
              {createSlot.isPending ? "Adding…" : "Add slot"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}