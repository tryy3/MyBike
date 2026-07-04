import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { type Component } from "shared";

import { ComboboxField } from "@/components/ComboboxField";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateComponent, useFieldSuggestions, useUpdateComponent } from "./api";
import {
  hoursMinutesToMinutes,
  kmInputToMeters,
  metersToKmInput,
  minutesToHoursMinutes,
} from "./form-utils";

const optionalNumericString = z
  .string()
  .refine((v) => v.trim() === "" || Number.isFinite(Number(v)), "Must be a number");

const formSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  notes: z.string().max(5000).nullish(),
  distanceKm: optionalNumericString,
  movingTimeHours: optionalNumericString,
  movingTimeMinutes: optionalNumericString,
  purchaseDate: z.string().nullish(),
  purchaseCost: optionalNumericString,
  purchaseStore: z.string().max(200).nullish(),
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
  const distanceMeters = kmInputToMeters(raw.distanceKm ?? "");
  const movingTimeMinutes = hoursMinutesToMinutes(
    raw.movingTimeHours ?? "",
    raw.movingTimeMinutes ?? "",
  );
  const purchaseCostRaw = raw.purchaseCost?.trim() ?? "";
  const purchaseCost = purchaseCostRaw === "" ? null : Number(purchaseCostRaw);

  return {
    name: raw.name.trim(),
    brand: raw.brand.trim(),
    model: raw.model.trim(),
    notes: trim(raw.notes ?? null),
    distanceMeters,
    movingTimeMinutes,
    purchaseDate: trim(raw.purchaseDate ?? null),
    purchaseCost: purchaseCost != null && Number.isFinite(purchaseCost) ? purchaseCost : null,
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
                  <FieldLabel htmlFor={field.name}>Distance (km)</FieldLabel>
                  <Input
                    id={field.name}
                    {...field}
                    value={field.value ?? ""}
                    type="number"
                    min={0}
                    step={0.1}
                    inputMode="decimal"
                    placeholder="e.g. 2400"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={fieldState.invalid ? errorId : undefined}
                  />
                  {fieldState.invalid && <FieldError id={errorId} errors={[fieldState.error]} />}
                </Field>
              );
            }}
          />

          <div className="flex flex-1 gap-2">
            <Controller
              name="movingTimeHours"
              control={form.control}
              render={({ field, fieldState }) => {
                const errorId = `${field.name}-error`;
                return (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Hours</FieldLabel>
                    <Input
                      id={field.name}
                      {...field}
                      value={field.value ?? ""}
                      type="number"
                      min={0}
                      step={1}
                      placeholder="0"
                      autoComplete="off"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={fieldState.invalid ? errorId : undefined}
                    />
                    {fieldState.invalid && <FieldError id={errorId} errors={[fieldState.error]} />}
                  </Field>
                );
              }}
            />
            <Controller
              name="movingTimeMinutes"
              control={form.control}
              render={({ field, fieldState }) => {
                const errorId = `${field.name}-error`;
                return (
                  <Field className="flex-1" data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Minutes</FieldLabel>
                    <Input
                      id={field.name}
                      {...field}
                      value={field.value ?? ""}
                      type="number"
                      min={0}
                      max={59}
                      step={1}
                      placeholder="0"
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
