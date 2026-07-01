import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { toast } from "sonner";
import { bikeInsertSchema, type Bike, type BikeInsert } from "shared";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateBike, useUpdateBike } from "./api";

interface BikeFormProps {
  bike?: Bike;
  bikeId?: string;
  onDone: () => void;
}

const EMPTY: BikeInsert = {
  name: "",
  brand: "",
  model: "",
  year: undefined,
  notes: "",
};

function normalize(raw: BikeInsert): BikeInsert {
  const trim = (v: string | null | undefined) =>
    !v || v.trim() === "" ? null : v;
  return {
    name: raw.name.trim(),
    brand: trim(raw.brand ?? null),
    model: trim(raw.model ?? null),
    year: raw.year === null ? null : raw.year,
    notes: trim(raw.notes ?? null),
  };
}

export function BikeForm({ bike, bikeId, onDone }: BikeFormProps) {
  const isEdit = !!bike && !!bikeId;
  const createBike = useCreateBike();
  const updateBike = useUpdateBike(bikeId ?? "");

  const form = useForm<BikeInsert>({
    resolver: zodResolver(bikeInsertSchema),
    defaultValues: bike
      ? {
          name: bike.name,
          brand: bike.brand ?? "",
          model: bike.model ?? "",
          year: bike.year ?? undefined,
          notes: bike.notes ?? "",
        }
      : EMPTY,
  });

  // Reset when the target bike changes (so reused dialogs show correct values).
  useEffect(() => {
    form.reset(
      bike
        ? {
            name: bike.name,
            brand: bike.brand ?? "",
            model: bike.model ?? "",
            year: bike.year ?? undefined,
            notes: bike.notes ?? "",
          }
        : EMPTY,
    );
  }, [bike, form]);

  const onSubmit = form.handleSubmit((data) => {
    const payload = normalize(data);
    const mutation = isEdit ? updateBike.mutateAsync : createBike.mutateAsync;
    mutation(
      // For edit we send the full payload; the server accepts partial updates.
      payload as BikeInsert,
    )
      .then(() => {
        toast.success(isEdit ? "Bike updated" : "Bike created");
        onDone();
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        toast.error("Could not save bike", { description: msg });
      });
  });

  const pending = createBike.isPending || updateBike.isPending;

  return (
    <form onSubmit={onSubmit} id="bike-form" className="flex flex-col gap-4">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                id={field.name}
                {...field}
                placeholder="e.g. Road Bike"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="flex gap-4">
          <Controller
            name="brand"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field className="flex-1" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Brand</FieldLabel>
                <Input
                  id={field.name}
                  {...field}
                  value={field.value ?? ""}
                  placeholder="e.g. Trek"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="model"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field className="flex-1" data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Model</FieldLabel>
                <Input
                  id={field.name}
                  {...field}
                  value={field.value ?? ""}
                  placeholder="e.g. Domane SLR"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </div>

        <Controller
          name="year"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Year</FieldLabel>
              <Input
                id={field.name}
                type="number"
                inputMode="numeric"
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                placeholder="e.g. 2023"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>Model year, if known.</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="notes"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
              <Textarea
                id={field.name}
                {...field}
                value={field.value ?? ""}
                placeholder="Anything worth remembering about this bike…"
                className="min-h-24"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create bike"}
        </Button>
      </div>
    </form>
  );
}
