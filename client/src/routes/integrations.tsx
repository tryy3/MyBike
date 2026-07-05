import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { BikeIcon, CloudIcon, Loader2Icon, RefreshCwIcon, RouteIcon } from "lucide-react";
import type { StravaImportItem } from "shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCommitStravaImport,
  usePreviewStravaImport,
  useStravaConnect,
  useStravaStatus,
  useSyncStrava,
} from "@/features/strava/api";

type ImportAction = "link" | "create" | "skip";

function formatDistance(meters: number): string {
  return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
}

function formatMovingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

function actionLabel(action: ImportAction, item: StravaImportItem): string {
  if (action === "skip") return "Skip";
  if (action === "create") return "Create bike";
  return item.matchedBikeName ? `Link to ${item.matchedBikeName}` : "Link matched bike";
}

function matchBadge(item: StravaImportItem) {
  if (item.matchReason === "strava_link" && item.matchedBikeName) {
    return <Badge variant="secondary">Already linked to {item.matchedBikeName}</Badge>;
  }
  if (item.matchReason === "name" && item.matchedBikeName) {
    return <Badge variant="secondary">Matches {item.matchedBikeName}</Badge>;
  }
  return <Badge variant="outline">No MyBike match</Badge>;
}

export function IntegrationsPage() {
  const navigate = useNavigate();
  const status = useStravaStatus();
  const connect = useStravaConnect();
  const preview = usePreviewStravaImport();
  const commit = useCommitStravaImport();
  const sync = useSyncStrava();

  const [importOpen, setImportOpen] = useState(false);
  const [actions, setActions] = useState<Record<string, ImportAction>>({});

  useEffect(() => {
    document.title = "Integrations | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  async function connectStrava(): Promise<void> {
    try {
      const authorizationUrl = await connect.mutateAsync();
      window.location.assign(authorizationUrl);
    } catch (err) {
      toast.error("Could not start Strava connection", {
        description: err instanceof Error ? err.message : "Check the server Strava settings.",
      });
    }
  }

  async function previewImport(): Promise<void> {
    setImportOpen(true);
    try {
      const result = await preview.mutateAsync();
      const nextActions: Record<string, ImportAction> = {};
      for (const item of result.items) {
        nextActions[item.gearId] = item.recommendedAction;
      }
      setActions(nextActions);
    } catch (err) {
      setImportOpen(false);
      toast.error("Could not load Strava bikes", {
        description: err instanceof Error ? err.message : "Try reconnecting Strava.",
      });
    }
  }

  async function commitImport(): Promise<void> {
    const items = preview.data?.items ?? [];
    const decisions = items.map((item) => {
      const action = actions[item.gearId] ?? item.recommendedAction;
      if (action === "link" && item.matchedBikeId) {
        return { gearId: item.gearId, action, bikeId: item.matchedBikeId } as const;
      }
      if (action === "create") {
        return { gearId: item.gearId, action } as const;
      }
      return { gearId: item.gearId, action: "skip" } as const;
    });

    try {
      const result = await commit.mutateAsync({ decisions });
      toast.success("Strava import applied", {
        description: `${result.linked} linked, ${result.created} created, ${result.creditedComponents} component credits applied.`,
      });
      setImportOpen(false);
      await navigate({ to: "/" });
    } catch (err) {
      toast.error("Could not apply Strava import", {
        description: err instanceof Error ? err.message : "Review the choices and try again.",
      });
    }
  }

  async function syncNow(): Promise<void> {
    try {
      const result = await sync.mutateAsync();
      toast.success("Strava sync complete", {
        description: `${result.processedActivities} new ride${result.processedActivities === 1 ? "" : "s"} processed; ${result.creditedComponents} component credit${result.creditedComponents === 1 ? "" : "s"} applied.`,
      });
    } catch (err) {
      toast.error("Could not sync Strava", {
        description: err instanceof Error ? err.message : "Try again after reconnecting Strava.",
      });
    }
  }

  const connected = status.data?.connected ?? false;
  const importItems = preview.data?.items ?? [];
  const actionableCount = importItems.filter((item) => actions[item.gearId] !== "skip").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect services that can keep your bike and component usage up to date.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <RouteIcon />
                Strava
              </CardTitle>
              <CardDescription>
                Import Strava bikes, link them to MyBike bikes, and add new ride distance to active
                components.
              </CardDescription>
            </div>
            <Badge variant={connected ? "secondary" : "outline"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
              <BikeIcon />
              Bike matching
            </div>
            Matched by existing Strava link first, then by normalized bike name.
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
              <CloudIcon />
              Import preview
            </div>
            Review each Strava bike before creating or linking anything.
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
              <RefreshCwIcon />
              Sync rides
            </div>
            New rides are recorded once and credited to active components on the linked bike.
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={connectStrava} disabled={connect.isPending}>
            {connected ? "Reconnect Strava" : "Connect Strava"}
          </Button>
          <Button
            variant="outline"
            onClick={previewImport}
            disabled={!connected || preview.isPending}
          >
            {preview.isPending ? (
              <>
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
                Loading from Strava…
              </>
            ) : (
              "Preview import"
            )}
          </Button>
          <Button variant="outline" onClick={syncNow} disabled={!connected || sync.isPending}>
            {sync.isPending ? (
              <>
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
                Syncing…
              </>
            ) : (
              <>
                <RefreshCwIcon data-icon="inline-start" />
                Sync now
              </>
            )}
          </Button>
          {connected && status.data ? (
            <span className="text-sm text-muted-foreground">
              {status.data.linkedBikes} linked bike{status.data.linkedBikes === 1 ? "" : "s"}
            </span>
          ) : null}
        </CardFooter>
      </Card>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!open && (preview.isPending || commit.isPending)) return;
          setImportOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review Strava import</DialogTitle>
            <DialogDescription>
              Choose whether each Strava bike should link to a matched bike, create a new bike, or
              be skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
            {preview.isPending ? (
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center"
                role="status"
                aria-live="polite"
              >
                <Loader2Icon className="size-8 animate-spin text-muted-foreground" aria-hidden />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">Fetching data from Strava</p>
                  <p className="text-sm text-muted-foreground">
                    Loading your bikes and activity history. This can take a moment.
                  </p>
                </div>
              </div>
            ) : commit.isPending ? (
              <div
                className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center"
                role="status"
                aria-live="polite"
              >
                <Loader2Icon className="size-8 animate-spin text-muted-foreground" aria-hidden />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">Applying Strava import</p>
                  <p className="text-sm text-muted-foreground">
                    Linking bikes and crediting historical ride mileage to active components. This
                    can take a moment.
                  </p>
                </div>
              </div>
            ) : importItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No Strava bike activity was found.
              </p>
            ) : (
              importItems.map((item) => {
                const currentAction = actions[item.gearId] ?? item.recommendedAction;
                return (
                  <div key={item.gearId} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.stravaBikeName}</span>
                          {matchBadge(item)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Strava gear ID: {item.gearId}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.activityCount} ride{item.activityCount === 1 ? "" : "s"} ·{" "}
                          {formatDistance(item.distanceMeters)} ·{" "}
                          {formatMovingTime(item.movingTimeMinutes)}
                        </p>
                      </div>

                      <Select
                        value={currentAction}
                        disabled={commit.isPending}
                        onValueChange={(value) =>
                          setActions((prev) => ({
                            ...prev,
                            [item.gearId]: value as ImportAction,
                          }))
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Import action for ${item.stravaBikeName}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {item.matchedBikeId ? (
                              <SelectItem value="link">{actionLabel("link", item)}</SelectItem>
                            ) : null}
                            <SelectItem value="create">Create bike</SelectItem>
                            <SelectItem value="skip">Skip</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={commit.isPending || preview.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={commitImport}
              disabled={
                commit.isPending ||
                preview.isPending ||
                importItems.length === 0 ||
                actionableCount === 0
              }
            >
              {commit.isPending ? (
                <>
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                  Applying…
                </>
              ) : (
                `Apply ${actionableCount} choice${actionableCount === 1 ? "" : "s"}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
