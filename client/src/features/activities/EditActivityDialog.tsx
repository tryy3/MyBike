import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CATEGORIES, categoryLabel, type ActivityListItem, type Component } from "shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  hoursMinutesToMinutes,
  kmInputToMeters,
  metersToKmInput,
  minutesToHoursMinutes,
} from "@/features/components/form-utils";
import { useUpdateActivity } from "./api";

const formSchema = z
  .object({
    distanceKm: z.string().refine((v) => {
      const trimmed = v.trim();
      if (trimmed === "") return false;
      const n = Number(trimmed);
      return Number.isFinite(n) && n >= 0;
    }, "Distance must be a non-negative number"),
    movingTimeHours: z.string(),
    movingTimeMinutes: z.string(),
    componentIds: z.array(z.string().uuid()),
  })
  .superRefine((data, ctx) => {
    const hours = data.movingTimeHours.trim();
    const minutes = data.movingTimeMinutes.trim();
    if (hours === "" && minutes === "") {
      ctx.addIssue({ code: "custom", message: "Enter moving time", path: ["movingTimeHours"] });
      return;
    }
    const h = hours === "" ? 0 : Number(hours);
    const m = minutes === "" ? 0 : Number(minutes);
    if (!Number.isInteger(h) || h < 0) {
      ctx.addIssue({
        code: "custom",
        message: "Hours must be a whole number ≥ 0",
        path: ["movingTimeHours"],
      });
    }
    if (!Number.isInteger(m) || m < 0 || m > 59) {
      ctx.addIssue({
        code: "custom",
        message: "Minutes must be 0–59",
        path: ["movingTimeMinutes"],
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface EditActivityDialogProps {
  bikeId: string;
  activity: ActivityListItem | null;
  components: Component[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function groupComponentsByCategory(components: Component[]) {
  const byCategory = new Map<string, Component[]>();
  for (const component of components) {
    const list = byCategory.get(component.category);
    if (list) list.push(component);
    else byCategory.set(component.category, [component]);
  }
  return CATEGORIES.filter((c) => byCategory.has(c.id)).map((category) => ({
    category,
    components: byCategory.get(category.id) ?? [],
  }));
}

export function EditActivityDialog({
  bikeId,
  activity,
  components,
  open,
  onOpenChange,
}: EditActivityDialogProps) {
  const updateActivity = useUpdateActivity(bikeId);
  const grouped = groupComponentsByCategory(components);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      distanceKm: "",
      movingTimeHours: "",
      movingTimeMinutes: "",
      componentIds: [],
    },
  });

  useEffect(() => {
    if (!activity) return;
    const { hours, minutes } = minutesToHoursMinutes(activity.movingTimeMinutes);
    form.reset({
      distanceKm: metersToKmInput(activity.distanceMeters),
      movingTimeHours: hours,
      movingTimeMinutes: minutes,
      componentIds: activity.componentIds,
    });
  }, [activity, form]);

  async function onSubmit(values: FormValues) {
    if (!activity) return;

    const distanceMeters = kmInputToMeters(values.distanceKm);
    const movingTimeMinutes = hoursMinutesToMinutes(
      values.movingTimeHours,
      values.movingTimeMinutes,
    );
    if (distanceMeters == null || movingTimeMinutes == null) return;

    try {
      await updateActivity.mutateAsync({
        id: activity.id,
        data: {
          distanceMeters,
          movingTimeMinutes,
          componentIds: values.componentIds,
        },
      });
      toast.success("Activity updated");
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error("Could not update activity", { description: msg });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit ride</DialogTitle>
          <DialogDescription>
            Adjust distance, moving time, or which components were used on this ride.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="activity-distance">Distance (km)</FieldLabel>
              <Input id="activity-distance" inputMode="decimal" {...form.register("distanceKm")} />
              <FieldError errors={[form.formState.errors.distanceKm]} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="activity-hours">Hours</FieldLabel>
                <Input
                  id="activity-hours"
                  inputMode="numeric"
                  {...form.register("movingTimeHours")}
                />
                <FieldError errors={[form.formState.errors.movingTimeHours]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="activity-minutes">Minutes</FieldLabel>
                <Input
                  id="activity-minutes"
                  inputMode="numeric"
                  {...form.register("movingTimeMinutes")}
                />
                <FieldError errors={[form.formState.errors.movingTimeMinutes]} />
              </Field>
            </div>
          </FieldGroup>

          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Components on this ride</p>
            <Controller
              control={form.control}
              name="componentIds"
              render={({ field }) => (
                <div className="flex max-h-64 flex-col gap-4 overflow-y-auto rounded-md border p-3">
                  {grouped.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No components on this bike yet.</p>
                  ) : (
                    grouped.map(({ category, components: categoryComponents }) => (
                      <div key={category.id} className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {categoryLabel(category.id)}
                        </p>
                        <ul className="flex flex-col gap-2">
                          {categoryComponents.map((component) => {
                            const checked = field.value.includes(component.id);
                            return (
                              <li key={component.id}>
                                <Label className="flex cursor-pointer items-start gap-2 font-normal">
                                  <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={checked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        field.onChange([...field.value, component.id]);
                                      } else {
                                        field.onChange(
                                          field.value.filter((id) => id !== component.id),
                                        );
                                      }
                                    }}
                                  />
                                  <span>
                                    {component.name}
                                    {!component.isActive ? (
                                      <span className="text-muted-foreground"> (inactive)</span>
                                    ) : null}
                                  </span>
                                </Label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateActivity.isPending}>
              {updateActivity.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
