import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { type ComponentOption } from "shared";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateOption, useUpdateOption } from "./api";

// The form never lets users toggle is_active (that's done via a dedicated
// "Use this" action), so it validates against just the editable fields.
// The field constraints mirror `componentOptionInsertSchema` from `shared`,
// which is what the server uses to validate.
const formSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).nullish(),
  model: z.string().max(200).nullish(),
  notes: z.string().max(5000).nullish(),
});
type OptionFormValues = z.infer<typeof formSchema>;

interface OptionFormProps {
  bikeId: string;
  slotId: string;
  option?: ComponentOption;
  onDone: () => void;
}

const EMPTY: OptionFormValues = {
  name: "",
  brand: "",
  model: "",
  notes: "",
};

function normalize(raw: OptionFormValues): OptionFormValues {
  const trim = (v: string | null | undefined) =>
    !v || v.trim() === "" ? null : v;
  return {
    name: raw.name.trim(),
    brand: trim(raw.brand ?? null),
    model: trim(raw.model ?? null),
    notes: trim(raw.notes ?? null),
  };
}

export function OptionForm({ bikeId, slotId, option, onDone }: OptionFormProps) {
  const isEdit = !!option;
  const createOption = useCreateOption(bikeId);
  const updateOption = useUpdateOption(bikeId);

  const form = useForm<OptionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: option
      ? {
          name: option.name,
          brand: option.brand ?? "",
          model: option.model ?? "",
          notes: option.notes ?? "",
        }
      : EMPTY,
  });

  useEffect(() => {
    form.reset(
      option
        ? {
            name: option.name,
            brand: option.brand ?? "",
            model: option.model ?? "",
            notes: option.notes ?? "",
          }
        : EMPTY,
    );
  }, [option, form]);

  const onSubmit = form.handleSubmit((data) => {
    const normalized = normalize(data);
    const result = isEdit
      ? updateOption.mutateAsync({ id: option!.id, data: normalized })
      : createOption.mutateAsync({
          slotId,
          data: { ...normalized, isActive: false },
        });
    result
      .then(() => {
        toast.success(isEdit ? "Option updated" : "Option added");
        onDone();
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        toast.error("Could not save option", { description: msg });
      });
  });

  const pending = createOption.isPending || updateOption.isPending;

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
          {pending ? "Saving…" : isEdit ? "Save option" : "Add option"}
        </Button>
      </div>
    </form>
  );
}