import { useState, useMemo } from "react";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ChevronRightIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import type { Bike } from "shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty } from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BikeForm } from "@/features/bikes/BikeForm";
import { useBikes, useDeleteBike } from "@/features/bikes/api";
import { useGarageStats } from "@/features/stats/api";
import { formatStatsLine } from "@/lib/format-stats";
import { cn } from "@/lib/utils";

export function BikesListPage() {
  const { data, isPending, isError, error, refetch, isFetching } = useBikes();
  const garageStats = useGarageStats();
  const deleteBike = useDeleteBike();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Bike | null>(null);
  const [deleting, setDeleting] = useState<Bike | null>(null);

  const statsByBikeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of garageStats.data?.bikes ?? []) {
      map.set(
        entry.bikeId,
        entry.rideStats
          ? formatStatsLine(entry.rideStats.distanceMeters, entry.rideStats.movingTimeMinutes)
          : "—",
      );
    }
    return map;
  }, [garageStats.data]);

  useEffect(() => {
    document.title = "Bikes | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  const onDelete = async () => {
    if (!deleting) return;
    try {
      await deleteBike.mutateAsync(deleting.id);
      toast.success("Bike deleted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error("Could not delete bike", { description: msg });
      throw e;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bikes</h1>
          <p className="text-sm text-muted-foreground">
            Track your bikes and the interchangeable components on each.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon />
          New bike
        </Button>
      </div>

      {isPending ? (
        <Card>
          <CardContent
            className="p-6 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            Loading bikes…
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <p className="text-sm text-destructive">Could not load bikes: {error?.message}</p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Refresh
            </Button>
          </CardContent>
        </Card>
      ) : data && data.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bike</TableHead>
                <TableHead className="hidden sm:table-cell">Brand / Model</TableHead>
                <TableHead className="hidden md:table-cell text-right">Components</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Mileage</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((bike) => (
                <TableRow key={bike.id} className={cn(isFetching && "opacity-60")}>
                  <TableCell>
                    <Link
                      to="/bikes/$bikeId"
                      params={{ bikeId: bike.id }}
                      className="flex flex-col gap-0.5 font-medium hover:underline"
                    >
                      <span>{bike.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {[bike.year].filter(Boolean).join(" · ")}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground tabular-nums lg:hidden">
                        {statsByBikeId.get(bike.id) ?? "—"}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {[bike.brand, bike.model].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right tabular-nums">
                    {bike.componentCount}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
                    {statsByBikeId.get(bike.id) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        asChild
                        aria-label={`Open ${bike.name}`}
                      >
                        <Link to="/bikes/$bikeId" params={{ bikeId: bike.id }}>
                          <ChevronRightIcon />
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Actions for ${bike.name}`}
                          >
                            <EllipsisVerticalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(bike)}>
                            <PencilIcon /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(bike)}
                          >
                            <Trash2Icon /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Empty className="min-h-64 border">
          <div className="flex flex-col items-center gap-3">
            <NoBikesIcon />
            <div className="flex flex-col gap-1 text-center">
              <p className="font-medium">No bikes yet</p>
              <p className="text-sm text-muted-foreground">
                Add your first bike to start tracking its components.
              </p>
            </div>
            <Button onClick={() => setCreating(true)} size="sm">
              <PlusIcon /> New bike
            </Button>
          </div>
        </Empty>
      )}

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New bike</DialogTitle>
            <DialogDescription>Add a bike to your garage.</DialogDescription>
          </DialogHeader>
          <BikeForm onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit bike</DialogTitle>
            <DialogDescription>Update this bike's details.</DialogDescription>
          </DialogHeader>
          {editing && (
            <BikeForm bike={editing} bikeId={editing.id} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete bike?"
        description={
          deleting
            ? `"${deleting.name}" and all of its components will be permanently deleted.`
            : ""
        }
        confirmLabel="Delete bike"
        loading={deleteBike.isPending}
        loadingLabel="Deleting…"
        onConfirm={onDelete}
      />
    </div>
  );
}

function NoBikesIcon() {
  return (
    <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <span className="text-2xl" aria-hidden="true">
        🚲
      </span>
    </div>
  );
}
