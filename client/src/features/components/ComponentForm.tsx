import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { type Component } from "shared";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateComponent, useUpdateComponent } from "./api";

// The form never lets users toggle is_active (that's done via a dedicated
// "Use this" action) nor change category once set, so it validates against
// just the editable fields. The field constraints mirror
// `componentInsertSchema` from `shared`, which is what the server uses.
const formSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullish(),
  model: z.string().max(200).nullish(),
  notes: z.string().max(5000).nullish(),
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
};

function normalize(raw: ComponentFormValues): ComponentFormValues {
  const trim = (v: string | null | undefined) =>
    !v || v.trim() === "" ? null : v;
  return {
    name: raw.name.trim(),
    brand: trim(raw.brand ?? null),
    model: trim(raw.model ?? null),
    notes: trim(raw.notes ?? null),
  };
}

export function ComponentForm({
  bikeId,
  category,
  component,
  onDone,
}: ComponentFormProps) {
  const isEdit = !!component;
  const createComponent = useCreateComponent(bikeId);
  const updateComponent = useUpdateComponent(bikeId);

  const form = useForm<ComponentFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: component
      ? {
          name: component.name,
          brand: component.brand ?? "",
          model: component.model ?? "",
          notes: component.notes ?? "",
        }
      : EMPTY,
  });

  useEffect(() => {
    form.reset(
      component
        ? {
            name: component.name,
            brand: component.brand ?? "",
            model: component.model ?? "",
            notes: component.notes ?? "",
          }
        : EMPTY,
    );
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
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                id={field.name}
                {...field}
                placeholder="e.g. Carbon wheelset"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
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
                  placeholder="e.g. Zipp"
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
                  placeholder="e.g. 303 Firecrest"
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
          name="notes"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Notes</FieldLabel>
              <Textarea
                id={field.name}
                {...field}
                value={field.value ?? ""}
                placeholder="Specs, condition, usage notes…"
                className="min-h-20"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
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