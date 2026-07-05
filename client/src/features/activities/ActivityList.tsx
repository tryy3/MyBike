import { useMemo, useState } from "react";
import { PencilIcon } from "lucide-react";
import type { ActivityListItem, Component } from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistance, formatMovingTime } from "@/lib/format-stats";
import { useBikeActivities } from "./api";
import { EditActivityDialog } from "./EditActivityDialog";

interface ActivityListProps {
  bikeId: string;
  components: Component[];
}

function formatActivityDate(startDate: string): string {
  const date = new Date(startDate);
  if (Number.isNaN(date.getTime())) return startDate;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ActivityList({ bikeId, components }: ActivityListProps) {
  const activities = useBikeActivities(bikeId);
  const [editing, setEditing] = useState<ActivityListItem | null>(null);

  const items = useMemo(
    () => activities.data?.pages.flatMap((page) => page.items) ?? [],
    [activities.data?.pages],
  );

  if (activities.isPending) {
    return <p className="text-sm text-muted-foreground">Loading activities…</p>;
  }

  if (activities.isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load activities: {activities.error.message}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No synced rides yet. Connect Strava and sync to see activities here.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Distance</TableHead>
            <TableHead>Moving time</TableHead>
            <TableHead>Components</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Edit</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((activity) => (
            <TableRow key={activity.id}>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span>{formatActivityDate(activity.startDate)}</span>
                  {activity.editedAt != null ? (
                    <span className="text-xs text-muted-foreground">Edited</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="tabular-nums">
                {formatDistance(activity.distanceMeters)}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatMovingTime(activity.movingTimeMinutes)}
              </TableCell>
              <TableCell>
                {activity.componentNames.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {activity.componentNames.map((name) => (
                      <Badge key={name} variant="secondary">
                        {name}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Edit ride on ${formatActivityDate(activity.startDate)}`}
                  onClick={() => setEditing(activity)}
                >
                  <PencilIcon />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {activities.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="w-max"
          disabled={activities.isFetchingNextPage}
          onClick={() => void activities.fetchNextPage()}
        >
          {activities.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <EditActivityDialog
        bikeId={bikeId}
        activity={editing}
        components={components}
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}
