import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelpIcon, RotateCcwIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { type Component } from "shared";

import { ComboboxField } from "@/components/ComboboxField";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateComponent, useFieldSuggestions, useUpdateComponent } from "./api";
import {
  hoursMinutesToMinutes,
  kmInputToMeters,
  metersToKmInput,
  minutesToHoursMinutes,
} from "./form-utils";

const optionalNonNegativeNumber = (label: string) =>
  z.string().refine((v) => {
    const trimmed = v.trim();
    if (trimmed === "") return true;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0;
  }, `${label} must be a non-negative number`);

const optionalWholeNumber = (label: string, max?: number) =>
  z.string().refine(
    (v) => {
      const trimmed = v.trim();
      if (trimmed === "") return true;
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) return false;
      return max == null || n <= max;
    },
    max != null
      ? `${label} must be a whole number from 0 to ${max}`
      : `${label} must be a whole number ≥ 0`,
  );

const formSchema = z
  .object({
    name: z.string().min(1).max(200),
    brand: z.string().min(1).max(200),
    model: z.string().min(1).max(200),
    notes: z.string().max(5000).nullish(),
    distanceKm: optionalNonNegativeNumber("Distance"),
    movingTimeHours: optionalWholeNumber("Hours"),
    movingTimeMinutes: optionalWholeNumber("Minutes", 59),
    purchaseDate: z.string().nullish(),
    purchaseCost: optionalNonNegativeNumber("Purchase cost"),
    purchaseStore: z.string().max(200).nullish(),
  })
  .superRefine((data, ctx) => {
    const hours = data.movingTimeHours?.trim() ?? "";
    const minutes = data.movingTimeMinutes?.trim() ?? "";
    if (hours === "" && minutes === "") return;

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
        message: "Minutes must be a whole number from 0 to 59",
        path: ["movingTimeMinutes"],
      });
    }
  });
type ComponentFormValues = z.infer<typeof formSchema>;

interface ComponentFormProps {
  bikeId: string;
  category: string;
  component?: Component;
  onDone: () => void;
}

const EMPTY: ComponentFormValues = {
  name: "",
  brand: "",
  model: "",
  notes: "",
  distanceKm: "",
  movingTimeHours: "",
  movingTimeMinutes: "",
  purchaseDate: "",
  purchaseCost: "",
  purchaseStore: "",
};

function toFormValues(component: Component): ComponentFormValues {
  const { hours, minutes } = minutesToHoursMinutes(component.movingTimeMinutes);
  return {
    name: component.name,
    brand: component.brand ?? "",
    model: component.model ?? "",
    notes: component.notes ?? "",
    distanceKm: metersToKmInput(component.distanceMeters),
    movingTimeHours: hours,
    movingTimeMinutes: minutes,
    purchaseDate: component.purchaseDate ?? "",
    purchaseCost: component.purchaseCost != null ? String(component.purchaseCost) : "",
    purchaseStore: component.purchaseStore ?? "",
  };
}

function normalize(raw: ComponentFormValues) {
  const trim = (v: string | null | undefined) => (!v || v.trim() === "" ? null : v.trim());

  return {
    name: raw.name.trim(),
    brand: raw.brand.trim(),
    model: raw.model.trim(),
    notes: trim(raw.notes ?? null),
    distanceMeters: kmInputToMeters(raw.distanceKm ?? ""),
    movingTimeMinutes: hoursMinutesToMinutes(
      raw.movingTimeHours ?? "",
      raw.movingTimeMinutes ?? "",
    ),
    purchaseDate: trim(raw.purchaseDate ?? null),
    purchaseCost: (() => {
      const trimmed = raw.purchaseCost?.trim() ?? "";
      return trimmed === "" ? null : Number(trimmed);
    })(),
    purchaseStore: trim(raw.purchaseStore ?? null),
  };
}

export function ComponentForm({ bikeId, category, component, onDone }: ComponentFormProps) {
  const isEdit = !!component;
  const createComponent = useCreateComponent(bikeId);
  const updateComponent = useUpdateComponent(bikeId);
  const { data: suggestions } = useFieldSuggestions();

  const form = useForm<ComponentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: component ? toFormValues(component) : EMPTY,
  });

  useEffect(() => {
    form.reset(component ? toFormValues(component) : EMPTY);
  }, [component, form]);

  const onSubmit = form.handleSubmit((data) => {
    const normalized = normalize(data);
    const result = isEdit
      ? updateComponent.mutateAsync({ id: component!.id, data: normalized })
      : createComponent.mutateAsync({
          category,
          ...normalized,
          isActive: false,
        });
    result
      .then(() => {
        toast.success(isEdit ? "Component updated" : "Component added");
        onDone();
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        toast.error("Could not save component", { description: msg });
      });
  });

  const pending = createComponent.isPending || updateComponent.isPending;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <ComboboxField
          control={form.control}
          name="name"
          label="Name"
          placeholder="e.g. Carbon wheelset"
          suggestions={suggestions?.name ?? []}
        />

        <div className="flex flex-col gap-4 sm:flex-row">
          <ComboboxField
            control={form.control}
            name="brand"
            label="Brand"
            placeholder="e.g. Zipp"
            suggestions={suggestions?.brand ?? []}
          />
          <ComboboxField
            control={form.control}
            name="model"
            label="Model"
            placeholder="e.g. 303 Firecrest"
            suggestions={suggestions?.model ?? []}
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Controller
            name="distanceKm"
            control={form.control}
            render={({ field, fieldState }) => {
              const errorId = `${field.name}-error`;
              return (
                <Field className="flex-1" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name} className="items-center">
                    Starting distance (km)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="About starting distance"
                        >
                          <CircleHelpIcon className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-56 text-pretty">
                        Wear before MyBike or Strava tracking. Ride mileage is added from synced
                        activities.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <div className="w-full">
                    <InputGroup className="w-auto min-w-0">
                      <InputGroupInput
                        id={field.name}
                        {...field}
                        value={field.value ?? ""}
                        type="number"
                        min={0}
                        step={0.1}
                        inputMode="decimal"
                        placeholder="e.g. 100"
                        autoComplete="off"
                        aria-invalid={fieldState.invalid}
                        aria-describedby={fieldState.invalid ? errorId : undefined}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          aria-label="Reset starting distance"
                          disabled={!field.value?.trim()}
                          onClick={() => field.onChange("")}
                        >
                          <RotateCcwIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </div>
                  {fieldState.invalid && <FieldError id={errorId} errors={[fieldState.error]} />}
                </Field>
              );
            }}
          />

          <Controller
            name="movingTimeHours"
            control={form.control}
            render={({ field: hoursField, fieldState: hoursState }) => (
              <Controller
                name="movingTimeMinutes"
                control={form.control}
                render={({ field: minutesField, fieldState: minutesState }) => {
                  const invalid = hoursState.invalid || minutesState.invalid;
                  const errorId = "movingTime-error";
                  const errors = [hoursState.error, minutesState.error];
                  const hasValue = Boolean(hoursField.value?.trim() || minutesField.value?.trim());

                  return (
                    <Field className="flex-1" data-invalid={invalid}>
                      <FieldLabel htmlFor={hoursField.name}>Moving time</FieldLabel>
                      <div className="w-full">
                        <InputGroup className="w-auto min-w-0">
                          <InputGroupInput
                            id={hoursField.name}
                            {...hoursField}
                            value={hoursField.value ?? ""}
                            type="number"
                            min={0}
                            step={1}
                            placeholder="0"
                            autoComplete="off"
                            aria-label="Hours"
                            aria-invalid={hoursState.invalid}
                            aria-describedby={invalid ? errorId : undefined}
                          />
                          <InputGroupText>h</InputGroupText>
                          <InputGroupInput
                            id={minutesField.name}
                            {...minutesField}
                            value={minutesField.value ?? ""}
                            type="number"
                            min={0}
                            max={59}
                            step={1}
                            placeholder="0"
                            autoComplete="off"
                            aria-label="Minutes"
                            aria-invalid={minutesState.invalid}
                            aria-describedby={invalid ? errorId : undefined}
                            className="border-l border-input"
                          />
                          <InputGroupText>min</InputGroupText>
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              aria-label="Reset moving time"
                              disabled={!hasValue}
                              onClick={() => {
                                hoursField.onChange("");
                                minutesField.onChange("");
                              }}
                            >
                              <RotateCcwIcon />
                            </InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>
                      </div>
                      {invalid && <FieldError id={errorId} errors={errors} />}
                    </Field>
                  );
                }}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Controller
            name="purchaseDate"
            control={form.control}
            render={({ field, fieldState }) => {
              const errorId = `${field.name}-error`;
              return (
                <Field className="flex-1" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Purchase date</FieldLabel>
                  <Input
                    id={field.name}
                    {...field}
                    value={field.value ?? ""}
                    type="date"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? errorId : undefined}
                  />
                  {fieldState.invalid && <FieldError id={errorId} errors={[fieldState.error]} />}
                </Field>
              );
            }}
          />

          <Controller
            name="purchaseCost"
            control={form.control}
            render={({ field, fieldState }) => {
              const errorId = `${field.name}-error`;
              return (
                <Field className="flex-1" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Purchase cost</FieldLabel>
                  <Input
                    id={field.name}
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    placeholder="e.g. 299"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? errorId : undefined}
                  />
                  {fieldState.invalid && <FieldError id={errorId} errors={[fieldState.error]} />}
                </Field>
              );
            }}
          />
        </div>

        <ComboboxField
          control={form.control}
          name="purchaseStore"
          label="Purchase store"
          placeholder="e.g. Local bike shop"
          suggestions={suggestions?.purchaseStore ?? []}
        />

        <Controller
          name="notes"
          control={form.control}
          render={({ field, fieldState }) => {
            const errorId = `${field.name}-error`;
            return (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
                <Textarea
                  id={field.name}
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Specs, condition, usage notes…"
                  className="min-h-20"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={fieldState.invalid ? errorId : undefined}
                />
                {fieldState.invalid && <FieldError id={errorId} errors={[fieldState.error]} />}
              </Field>
            );
          }}
        />
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save component" : "Add component"}
        </Button>
      </div>
    </form>
  );
}
