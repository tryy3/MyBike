import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  CATEGORIES,
  SNOOZE_DISTANCE_PRESETS_METERS,
  SNOOZE_TIME_PRESETS_DAYS,
  groupHasDueMaintenanceTasks,
  groupMaintenanceTasksBySystem,
  type MaintenanceTaskInsert,
  type MaintenanceTaskUpdate,
  type SystemGroupDef,
  categoryLabel,
} from "shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ComponentCategoryLabel,
  ComponentDetailTier,
  ComponentIdentityTier,
  ComponentNameLabel,
} from "@/features/components/component-list-layout";
import { componentBrandModel } from "@/features/components/component-display";
import { useBike } from "@/features/bikes/api";
import { bikeTabPaths } from "@/routes/bike-routes";
import {
  GROUP_DOT_CLASS,
  GROUP_HOVER_TINT_CLASS,
  GROUP_SECTION_BORDER_CLASS,
  GROUP_SECTION_TINT_CLASS,
} from "@/lib/system-group-styles";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import type { MaintenanceTaskGql } from "@/lib/graphql/operations";
import {
  formatTaskProgress,
  isTaskDue,
  taskProgressPercent,
  taskShowsDueSoonBadge,
  taskVisualUrgency,
  type TaskVisualUrgency,
  useBikeMaintenance,
  useCompleteMaintenanceTask,
  useCreateMaintenanceTask,
  useDeleteMaintenanceTask,
  useReplaceMaintenanceTask,
  useResetMaintenanceTask,
  useSnoozeMaintenanceTask,
  useToggleMaintenanceTask,
  useToggleTouchUp,
  useClearTouchUpChecklist,
  useUpdateMaintenanceTask,
} from "./api";

interface MaintenanceTabProps {
  bikeId: string;
  enabled?: boolean;
  /** When set (e.g. from component alert link), scroll to the first due task in this category. */
  focusCategory?: string;
}

export function maintenanceTaskElementId(taskId: string): string {
  return `maintenance-task-${taskId}`;
}

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

/** Card stripe + ring urgency — independent of subsystem group color. */
const URGENCY_STRIPE_CLASS: Record<TaskVisualUrgency, string> = {
  overdue: "bg-destructive",
  due: "bg-destructive",
  snoozed: "bg-cyan-500",
  warning: "bg-amber-500",
  ok: "bg-emerald-600",
  muted: "bg-muted-foreground/35",
};

const URGENCY_RING_STROKE_CLASS: Record<TaskVisualUrgency, string> = {
  overdue: "stroke-destructive",
  due: "stroke-destructive",
  snoozed: "stroke-cyan-500",
  warning: "stroke-amber-500",
  ok: "stroke-emerald-600",
  muted: "stroke-muted-foreground/50",
};

function TaskProgressRing({ task }: { task: MaintenanceTaskGql }) {
  const percent = taskProgressPercent(task);
  if (percent == null) return null;

  const size = 40;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcPercent = Math.min(100, percent);
  const dashOffset = circumference - (arcPercent / 100) * circumference;
  const displayPercent = Math.round(percent);
  const urgency = taskVisualUrgency(task);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${displayPercent}% of service interval`}
      title={`${displayPercent}% of interval`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={URGENCY_RING_STROKE_CLASS[urgency]}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-muted-foreground">
        {displayPercent}%
      </span>
    </div>
  );
}

function TaskProgressDisplay({ task }: { task: MaintenanceTaskGql }) {
  const progress = formatTaskProgress(task);
  const percent = taskProgressPercent(task);
  if (!progress && percent == null) return null;

  return (
    <div className="flex items-center gap-3 pb-1">
      {percent != null ? <TaskProgressRing task={task} /> : null}
      {progress ? (
        <p className="min-w-0 flex-1 text-xs tabular-nums text-muted-foreground">{progress}</p>
      ) : null}
    </div>
  );
}

function statusBadge(task: MaintenanceTaskGql) {
  if (task.status === "overdue") {
    return <Badge variant="destructive">Overdue</Badge>;
  }
  if (task.status === "due") {
    return <Badge variant="destructive">Due</Badge>;
  }
  if (task.status === "snoozed") {
    return (
      <Badge
        variant="secondary"
        className="border-cyan-500/30 bg-cyan-500/10 text-cyan-900 dark:text-cyan-300"
      >
        Snoozed
      </Badge>
    );
  }
  if (!task.enabled) {
    return <Badge variant="outline">Disabled</Badge>;
  }
  if (taskShowsDueSoonBadge(task)) {
    return (
      <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-400">
        Due soon
      </Badge>
    );
  }
  return null;
}

function TaskActions({
  bikeId,
  task,
  onSnooze,
  onReplace,
}: {
  bikeId: string;
  task: MaintenanceTaskGql;
  onSnooze: (task: MaintenanceTaskGql) => void;
  onReplace: (task: MaintenanceTaskGql) => void;
}) {
  const complete = useCompleteMaintenanceTask(bikeId);

  if (task.kind === "touch_up" || !task.enabled) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="default"
        disabled={complete.isPending}
        onClick={() =>
          void complete.mutateAsync({ id: task.id }).then(
            () => toast.success("Marked done"),
            (error) =>
              toast.error("Could not complete task", {
                description: mutationErrorMessage(error),
              }),
          )
        }
      >
        {complete.isPending ? (
          <>
            <Loader2Icon className="size-3.5 animate-spin" />
            Saving…
          </>
        ) : (
          "Mark done"
        )}
      </Button>
      <Button size="sm" variant="outline" onClick={() => onSnooze(task)}>
        Snooze
      </Button>
      {task.kind === "eol" && (
        <Button size="sm" variant="secondary" onClick={() => onReplace(task)}>
          Replace
        </Button>
      )}
      {task.guideUrl && (
        <Button size="sm" variant="ghost" asChild>
          <a href={task.guideUrl} target="_blank" rel="noreferrer">
            <ExternalLinkIcon />
            Guide
          </a>
        </Button>
      )}
    </div>
  );
}

function TaskCard({
  bikeId,
  task,
  onSnooze,
  onReplace,
  onEdit,
}: {
  bikeId: string;
  task: MaintenanceTaskGql;
  onSnooze: (task: MaintenanceTaskGql) => void;
  onReplace: (task: MaintenanceTaskGql) => void;
  onEdit: (task: MaintenanceTaskGql) => void;
}) {
  const toggle = useToggleMaintenanceTask(bikeId);
  const del = useDeleteMaintenanceTask(bikeId);
  const reset = useResetMaintenanceTask(bikeId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleToggle = (enabled: boolean) => {
    void toggle.mutateAsync({ id: task.id, enabled }).then(
      () => toast.success(enabled ? "Task enabled" : "Task disabled"),
      (error) => toast.error("Could not update task", { description: mutationErrorMessage(error) }),
    );
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(task.id);
      toast.success("Task deleted");
    } catch (error) {
      toast.error("Could not delete task", { description: mutationErrorMessage(error) });
      throw error;
    }
  };

  const handleReset = () => {
    void reset.mutateAsync(task.id).then(
      () => toast.success("Reset to default"),
      (error) => toast.error("Could not reset task", { description: mutationErrorMessage(error) }),
    );
  };

  return (
    <div
      id={maintenanceTaskElementId(task.id)}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-card scroll-mt-24 transition-shadow",
        !task.enabled && "opacity-60",
      )}
    >
      <div className={cn("h-1", URGENCY_STRIPE_CLASS[taskVisualUrgency(task)])} />
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <ComponentIdentityTier separated={Boolean(task.description?.trim())}>
              {task.componentCategory ? (
                <ComponentCategoryLabel>
                  {categoryLabel(task.componentCategory)}
                </ComponentCategoryLabel>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <ComponentNameLabel>{task.title}</ComponentNameLabel>
                {statusBadge(task)}
                {task.kind === "eol" ? (
                  <Badge variant="outline" className="text-xs">
                    EOL
                  </Badge>
                ) : null}
              </div>
              <TaskProgressDisplay task={task} />
            </ComponentIdentityTier>
            {task.description ? (
              <ComponentDetailTier notes={task.description} lineClamp={3} />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Switch
              checked={task.enabled}
              disabled={toggle.isPending}
              onCheckedChange={handleToggle}
              aria-label={`Enable ${task.title}`}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Edit ${task.title}`}
              onClick={() => onEdit(task)}
            >
              <PencilIcon className="size-4" />
            </Button>
            {task.canDelete ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete task"
                disabled={del.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                {del.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
        <TaskActions bikeId={bikeId} task={task} onSnooze={onSnooze} onReplace={onReplace} />
        {task.customized && task.source === "builtin" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-auto w-fit px-0 py-0 text-xs"
            disabled={reset.isPending}
            onClick={handleReset}
          >
            {reset.isPending ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <RotateCcwIcon className="size-3" />
            )}
            Reset to default
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete task?"
        description={`"${task.title}" will be permanently removed from this bike.`}
        confirmLabel="Delete task"
        loading={del.isPending}
        loadingLabel="Deleting…"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function MaintenanceGroupSection({
  bikeId,
  group,
  tasks,
  onSnooze,
  onReplace,
  onEdit,
}: {
  bikeId: string;
  group: SystemGroupDef;
  tasks: MaintenanceTaskGql[];
  onSnooze: (task: MaintenanceTaskGql) => void;
  onReplace: (task: MaintenanceTaskGql) => void;
  onEdit: (task: MaintenanceTaskGql) => void;
}) {
  const hasDue = groupHasDueMaintenanceTasks(tasks);
  const [open, setOpen] = useState(hasDue);
  const dueCount = tasks.filter((task) => isTaskDue(task)).length;

  useEffect(() => {
    if (hasDue) setOpen(true);
  }, [hasDue]);

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border",
        GROUP_SECTION_TINT_CLASS[group.colorToken],
        GROUP_SECTION_BORDER_CLASS[group.colorToken],
      )}
    >
      <button
        type="button"
        className={cn(
          "mb-0 flex w-full cursor-pointer items-center gap-2.5 rounded-t-xl px-3 py-2.5 text-left transition-colors",
          GROUP_HOVER_TINT_CLASS[group.colorToken],
        )}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={cn("size-3.5 shrink-0 rounded-full", GROUP_DOT_CLASS[group.colorToken])}
          aria-hidden="true"
        />
        <h3 className="text-sm font-medium">{group.label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
        {dueCount > 0 ? (
          <Badge variant="destructive" className="text-xs">
            {dueCount} due
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">OK</span>
        )}
        <ChevronDownIcon
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180 motion-reduce:rotate-0",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 px-3 pb-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              bikeId={bikeId}
              task={task}
              onSnooze={onSnooze}
              onReplace={onReplace}
              onEdit={onEdit}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TouchUpChecklistItem({
  task,
  toggling,
  onToggle,
  onEdit,
}: {
  task: MaintenanceTaskGql;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const checkboxId = `touch-up-${task.id}`;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border p-3",
        !task.enabled && "opacity-50",
        toggling && "opacity-70",
      )}
    >
      <input
        id={checkboxId}
        type="checkbox"
        className={cn(
          "mt-0.5 size-4 shrink-0 accent-primary",
          toggling || !task.enabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        checked={task.lastCheckedAt != null}
        disabled={!task.enabled || toggling}
        onChange={onToggle}
      />
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium leading-snug">
          {task.title}
        </label>
        {task.description ? (
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        ) : null}
        {task.guideUrl ? (
          <a
            href={task.guideUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3" />
            Guide
          </a>
        ) : null}
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        className="shrink-0"
        aria-label={`Edit ${task.title}`}
        onClick={onEdit}
      >
        <PencilIcon className="size-4" />
      </Button>
    </div>
  );
}

function TouchUpChecklist({
  bikeId,
  tasks,
  onEdit,
}: {
  bikeId: string;
  tasks: MaintenanceTaskGql[];
  onEdit: (task: MaintenanceTaskGql) => void;
}) {
  const toggle = useToggleTouchUp(bikeId);
  const clearAll = useClearTouchUpChecklist(bikeId);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  const checkedCount = tasks.filter((task) => task.lastCheckedAt != null).length;

  const handleToggle = (task: MaintenanceTaskGql) => {
    setTogglingTaskId(task.id);
    void toggle
      .mutateAsync(task.id)
      .then(
        () => toast.success(task.lastCheckedAt != null ? "Check cleared" : "Marked checked"),
        (error) =>
          toast.error("Could not update check", { description: mutationErrorMessage(error) }),
      )
      .finally(() => setTogglingTaskId(null));
  };

  const handleClearAll = () => {
    void clearAll.mutateAsync().then(
      () => toast.success("Checklist cleared"),
      (error) =>
        toast.error("Could not clear checklist", {
          description: mutationErrorMessage(error),
        }),
    );
  };

  if (tasks.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-base">Touch-up checklist</CardTitle>
          <CardDescription>Optional pre-ride or cleaning checks — no due dates.</CardDescription>
        </div>
        {checkedCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={clearAll.isPending}
            onClick={handleClearAll}
          >
            {clearAll.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <RotateCcwIcon className="size-4" />
            )}
            Clear all
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tasks.map((task) => (
          <TouchUpChecklistItem
            key={task.id}
            task={task}
            toggling={togglingTaskId === task.id}
            onToggle={() => handleToggle(task)}
            onEdit={() => onEdit(task)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function kindLabel(kind: MaintenanceTaskGql["kind"]): string {
  if (kind === "touch_up") return "Touch-up checklist";
  if (kind === "eol") return "Replacement / EOL";
  return "Periodic service";
}

function TaskFormDialog({
  bikeId,
  task,
  open,
  onOpenChange,
}: {
  bikeId: string;
  task: MaintenanceTaskGql | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = task != null;
  const isBuiltin = task?.source === "builtin";
  const create = useCreateMaintenanceTask(bikeId);
  const update = useUpdateMaintenanceTask(bikeId);
  const reset = useResetMaintenanceTask(bikeId);
  const [kind, setKind] = useState<MaintenanceTaskInsert["kind"]>("periodic");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("chain");
  const [triggerMode, setTriggerMode] = useState<"distance" | "time" | "both">("distance");
  const [distanceKm, setDistanceKm] = useState("500");
  const [days, setDays] = useState("90");
  const [guideUrl, setGuideUrl] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (task) {
      setKind(task.kind);
      setTitle(task.title);
      setCategory(task.componentCategory ?? "chain");
      setTriggerMode(task.triggerMode ?? "distance");
      setDistanceKm(task.distanceMeters != null ? String(task.distanceMeters / 1000) : "");
      setDays(task.intervalDays != null ? String(task.intervalDays) : "");
      setGuideUrl(task.guideUrl ?? "");
      setDescription(task.description ?? "");
      return;
    }
    setKind("periodic");
    setTitle("");
    setCategory("chain");
    setTriggerMode("distance");
    setDistanceKm("500");
    setDays("90");
    setGuideUrl("");
    setDescription("");
  }, [open, task]);

  const effectiveKind = isEdit ? task!.kind : kind;
  const effectiveTriggerMode = isEdit ? (task!.triggerMode ?? "distance") : triggerMode;
  const showDistance =
    effectiveKind !== "touch_up" && (effectiveKind === "eol" || effectiveTriggerMode !== "time");
  const showDays = effectiveKind === "periodic" && effectiveTriggerMode !== "distance";
  const isPending = create.isPending || update.isPending;

  const validateFields = (): string | null => {
    if (!isEdit && !title.trim()) return "Title is required";
    if (showDistance) {
      const km = parseFloat(distanceKm);
      if (!distanceKm.trim() || Number.isNaN(km) || km <= 0) {
        return "Enter a valid distance in km";
      }
    }
    if (showDays) {
      const intervalDays = parseInt(days, 10);
      if (!days.trim() || Number.isNaN(intervalDays) || intervalDays <= 0) {
        return "Enter a valid interval in days";
      }
    }
    return null;
  };

  const buildUpdateInput = (): MaintenanceTaskUpdate => {
    const input: MaintenanceTaskUpdate = {
      guideUrl: guideUrl.trim() || null,
    };
    if (!isBuiltin) {
      input.description = description.trim() || null;
    }
    if (effectiveKind !== "touch_up") {
      if (showDistance) {
        input.distanceMeters = Math.round(parseFloat(distanceKm) * 1000);
      }
      if (showDays) {
        input.intervalDays = parseInt(days, 10);
      }
    }
    return input;
  };

  const buildCreateInput = (): MaintenanceTaskInsert => {
    const input: MaintenanceTaskInsert = {
      kind,
      title: title.trim(),
      description: description.trim() || null,
      guideUrl: guideUrl.trim() || null,
    };
    if (kind !== "touch_up") {
      input.componentCategory = category;
      if (kind === "eol") {
        input.triggerMode = "distance";
        input.distanceMeters = Math.round(parseFloat(distanceKm) * 1000);
      } else {
        input.triggerMode = triggerMode;
        if (triggerMode === "distance" || triggerMode === "both") {
          input.distanceMeters = Math.round(parseFloat(distanceKm) * 1000);
        }
        if (triggerMode === "time" || triggerMode === "both") {
          input.intervalDays = parseInt(days, 10);
        }
      }
    }
    return input;
  };

  const submit = async () => {
    const validationError = validateFields();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    try {
      if (isEdit) {
        if (isBuiltin) {
          await update.mutateAsync({ id: task.id, input: buildUpdateInput() });
        } else {
          const input: MaintenanceTaskUpdate = {
            title: title.trim(),
            description: description.trim() || null,
            guideUrl: guideUrl.trim() || null,
          };
          if (effectiveKind !== "touch_up") {
            input.componentCategory = category;
            if (effectiveKind === "eol") {
              input.triggerMode = "distance";
              input.distanceMeters = Math.round(parseFloat(distanceKm) * 1000);
            } else {
              input.triggerMode = triggerMode;
              if (triggerMode === "distance" || triggerMode === "both") {
                input.distanceMeters = Math.round(parseFloat(distanceKm) * 1000);
              }
              if (triggerMode === "time" || triggerMode === "both") {
                input.intervalDays = parseInt(days, 10);
              }
            }
          }
          await update.mutateAsync({ id: task.id, input });
        }
        toast.success("Task updated");
      } else {
        await create.mutateAsync(buildCreateInput());
        toast.success("Task added");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEdit ? "Could not update task" : "Could not add task", {
        description: mutationErrorMessage(error),
      });
    }
  };

  const canSubmit =
    (isEdit || title.trim().length > 0) &&
    (!showDistance || distanceKm.trim().length > 0) &&
    (!showDays || days.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "Add custom task"}</DialogTitle>
          <DialogDescription>
            {isBuiltin
              ? "Built-in tasks keep their name, type, and component. Adjust intervals or the guide link; reset to default to receive template updates."
              : isEdit
                ? "Update this custom maintenance task."
                : "Create a maintenance reminder unique to this bike."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <div className="flex flex-col gap-3">
            {isEdit && isBuiltin ? (
              <>
                <div className="grid gap-1">
                  <Label>Title</Label>
                  <p className="text-sm font-medium">{task.title}</p>
                </div>
                <div className="grid gap-1">
                  <Label>Type</Label>
                  <p className="text-sm text-muted-foreground">{kindLabel(task.kind)}</p>
                </div>
                {task.componentCategory && (
                  <div className="grid gap-1">
                    <Label>Component</Label>
                    <p className="text-sm text-muted-foreground">
                      {categoryLabel(task.componentCategory)}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {!isEdit && (
                  <div className="grid gap-2">
                    <Label>Kind</Label>
                    <Select
                      value={kind}
                      onValueChange={(v) => setKind(v as MaintenanceTaskInsert["kind"])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="touch_up">Touch-up checklist</SelectItem>
                        <SelectItem value="periodic">Periodic service</SelectItem>
                        <SelectItem value="eol">Replacement / EOL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isEdit && !isBuiltin && (
                  <div className="grid gap-1">
                    <Label>Type</Label>
                    <p className="text-sm text-muted-foreground">{kindLabel(task.kind)}</p>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="task-title">Title</Label>
                  <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                {effectiveKind !== "touch_up" && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="task-category">Component category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger id="task-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {effectiveKind === "periodic" && !isBuiltin && (
                      <div className="grid gap-2">
                        <Label>Trigger</Label>
                        <Select
                          value={triggerMode}
                          onValueChange={(v) => setTriggerMode(v as typeof triggerMode)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="distance">Distance</SelectItem>
                            <SelectItem value="time">Time</SelectItem>
                            <SelectItem value="both">Whichever first</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {showDistance && (
              <div className="grid gap-2">
                <Label htmlFor="task-distance-km">
                  {effectiveKind === "eol" ? "Wear limit (km)" : "Distance (km)"}
                </Label>
                <Input
                  id="task-distance-km"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="any"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(e.target.value)}
                />
              </div>
            )}
            {showDays && (
              <div className="grid gap-2">
                <Label htmlFor="task-interval-days">Interval (days)</Label>
                <Input
                  id="task-interval-days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="task-description">Description (optional)</Label>
              {isEdit && isBuiltin ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {description.trim() || "—"}
                </p>
              ) : (
                <Textarea
                  id="task-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Notes or instructions for this task"
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="guide-url">Guide URL (optional)</Label>
              <Input
                id="guide-url"
                type="url"
                value={guideUrl}
                onChange={(e) => setGuideUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {isEdit && isBuiltin && task.customized ? (
              <Button
                type="button"
                variant="ghost"
                disabled={reset.isPending}
                onClick={() =>
                  void reset.mutateAsync(task.id).then(
                    () => {
                      toast.success("Reset to default");
                      onOpenChange(false);
                    },
                    (error) =>
                      toast.error("Could not reset task", {
                        description: mutationErrorMessage(error),
                      }),
                  )
                }
              >
                {reset.isPending ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
                Reset to default
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={!canSubmit || isPending}>
              {isPending ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  {isEdit ? "Saving…" : "Adding…"}
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Add task"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MaintenanceTab({ bikeId, enabled = true, focusCategory }: MaintenanceTabProps) {
  const { data, isPending, isError, error } = useBikeMaintenance(bikeId, { enabled });
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MaintenanceTaskGql | null>(null);
  const [snoozeTask, setSnoozeTask] = useState<MaintenanceTaskGql | null>(null);
  const [replaceTask, setReplaceTask] = useState<MaintenanceTaskGql | null>(null);
  const snooze = useSnoozeMaintenanceTask(bikeId);

  useEffect(() => {
    if (!focusCategory || isPending || !data) return;

    const target = data.maintenanceTasks.find(
      (task) =>
        task.componentCategory === focusCategory &&
        task.enabled &&
        task.kind !== "touch_up" &&
        isTaskDue(task),
    );
    if (!target) return;

    let highlightTimer: number | undefined;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(maintenanceTaskElementId(target.id));
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-ring", "ring-offset-2", "ring-offset-background");
      highlightTimer = window.setTimeout(() => {
        element.classList.remove("ring-2", "ring-ring", "ring-offset-2", "ring-offset-background");
      }, 2500);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (highlightTimer != null) window.clearTimeout(highlightTimer);
    };
  }, [focusCategory, isPending, data]);

  const openCreateForm = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const openEditForm = (task: MaintenanceTaskGql) => {
    setEditingTask(task);
    setFormOpen(true);
  };

  const taskGroups = useMemo(
    () => groupMaintenanceTasksBySystem(data?.maintenanceTasks ?? []),
    [data?.maintenanceTasks],
  );

  const touchUps = useMemo(
    () => (data?.maintenanceTasks ?? []).filter((t) => t.kind === "touch_up"),
    [data?.maintenanceTasks],
  );

  if (isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Loading maintenance…
      </p>
    );
  }
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load maintenance"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <WrenchIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          {(data?.maintenanceAlertCount ?? 0) > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {data?.maintenanceAlertCount} alert
              {(data?.maintenanceAlertCount ?? 0) === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-sm text-emerald-700 dark:text-emerald-400">All clear</span>
          )}
        </div>
        <Button size="sm" onClick={openCreateForm}>
          <PlusIcon />
          Add task
        </Button>
      </div>

      {taskGroups.length > 0 ? (
        <div className="flex flex-col gap-4">
          {taskGroups.map(({ group, tasks }) => (
            <MaintenanceGroupSection
              key={group.id}
              bikeId={bikeId}
              group={group}
              tasks={tasks}
              onSnooze={setSnoozeTask}
              onReplace={setReplaceTask}
              onEdit={openEditForm}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No periodic or replacement tasks.</p>
      )}

      <TouchUpChecklist bikeId={bikeId} tasks={touchUps} onEdit={openEditForm} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(data?.serviceRecords.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">No service records yet.</p>
          ) : (
            data?.serviceRecords.map((record) => (
              <div key={record.id} className="flex flex-col border-b pb-2 last:border-0">
                <span className="font-medium capitalize">{record.action}</span>
                <span className="text-muted-foreground">
                  {new Date(record.completedAt).toLocaleString()}
                  {record.component ? ` · ${record.component.name}` : ""}
                </span>
                {record.notes && <span className="text-muted-foreground">{record.notes}</span>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <TaskFormDialog
        bikeId={bikeId}
        task={editingTask}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingTask(null);
        }}
      />

      <Dialog open={snoozeTask != null} onOpenChange={(o) => !o && setSnoozeTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snooze reminder</DialogTitle>
            <DialogDescription>{snoozeTask?.title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {SNOOZE_DISTANCE_PRESETS_METERS.map((m) => (
              <Button
                key={m}
                variant="outline"
                size="sm"
                disabled={snooze.isPending}
                onClick={() => {
                  if (!snoozeTask) return;
                  void snooze.mutateAsync({ id: snoozeTask.id, distanceMeters: m }).then(
                    () => {
                      toast.success("Snoozed");
                      setSnoozeTask(null);
                    },
                    (error) =>
                      toast.error("Could not snooze task", {
                        description: mutationErrorMessage(error),
                      }),
                  );
                }}
              >
                +{m / 1000} km
              </Button>
            ))}
            {SNOOZE_TIME_PRESETS_DAYS.map((d) => (
              <Button
                key={d}
                variant="outline"
                size="sm"
                disabled={snooze.isPending}
                onClick={() => {
                  if (!snoozeTask) return;
                  void snooze.mutateAsync({ id: snoozeTask.id, days: d }).then(
                    () => {
                      toast.success("Snoozed");
                      setSnoozeTask(null);
                    },
                    (error) =>
                      toast.error("Could not snooze task", {
                        description: mutationErrorMessage(error),
                      }),
                  );
                }}
              >
                {d} days
              </Button>
            ))}
          </div>
          {snooze.isPending ? (
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              Snoozing…
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={replaceTask != null} onOpenChange={(o) => !o && setReplaceTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record replacement</DialogTitle>
            <DialogDescription>{replaceTask?.title}</DialogDescription>
          </DialogHeader>
          <ReplaceForm bikeId={bikeId} task={replaceTask} onDone={() => setReplaceTask(null)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReplaceForm({
  bikeId,
  task,
  onDone,
}: {
  bikeId: string;
  task: MaintenanceTaskGql | null;
  onDone: () => void;
}) {
  const { data: bike } = useBike(bikeId);
  const replace = useReplaceMaintenanceTask(bikeId);
  const [notes, setNotes] = useState("");
  const [componentId, setComponentId] = useState("");
  const [resetWear, setResetWear] = useState(true);

  useEffect(() => {
    if (!task) return;
    setNotes("");
    setComponentId("");
    setResetWear(true);
  }, [task]);

  const candidates = useMemo(() => {
    if (!bike || !task?.componentCategory) return [];
    return bike.components
      .filter((component) => component.category === task.componentCategory)
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      });
  }, [bike, task?.componentCategory]);

  if (!task) return null;

  const categoryName = task.componentCategory ? categoryLabel(task.componentCategory) : null;
  const noneValue = "__none__";

  const handleSubmit = async () => {
    try {
      await replace.mutateAsync({
        id: task.id,
        notes: notes.trim() || undefined,
        newComponentId: componentId || undefined,
        resetWear: componentId ? resetWear : undefined,
      });
      toast.success("Replacement recorded");
      onDone();
    } catch (error) {
      toast.error("Could not record replacement", {
        description: mutationErrorMessage(error),
      });
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Logs a service record. Add a part on the{" "}
        <Link to={bikeTabPaths.components} params={{ bikeId }} className="underline">
          Components tab
        </Link>{" "}
        first, then optionally swap to an existing {categoryName?.toLowerCase() ?? "component"}{" "}
        below.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="replace-notes">Notes (optional)</Label>
        <Input id="replace-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="replace-component">Swap to component (optional)</Label>
        <Select
          value={componentId || noneValue}
          onValueChange={(value) => setComponentId(value === noneValue ? "" : value)}
        >
          <SelectTrigger id="replace-component">
            <SelectValue placeholder="No swap — log only" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={noneValue}>No swap — log only</SelectItem>
            {candidates.map((component) => {
              const meta = componentBrandModel(component);
              return (
                <SelectItem key={component.id} value={component.id}>
                  {component.name}
                  {component.isActive ? " (active)" : ""}
                  {meta ? ` · ${meta}` : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {candidates.length === 0 && categoryName ? (
          <p className="text-xs text-muted-foreground">
            No {categoryName.toLowerCase()} components yet — add one from the Components tab.
          </p>
        ) : null}
      </div>
      {componentId ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 cursor-pointer accent-primary"
            checked={resetWear}
            onChange={(e) => setResetWear(e.target.checked)}
          />
          Reset wear on selected component
        </label>
      ) : null}
      <Button type="submit" disabled={replace.isPending}>
        {replace.isPending ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Recording…
          </>
        ) : (
          "Record replacement"
        )}
      </Button>
    </form>
  );
}
