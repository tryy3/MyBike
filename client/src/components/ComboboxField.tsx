import { useMemo, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

interface ComboboxFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  suggestions: string[];
}

export function ComboboxField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  suggestions,
}: ComboboxFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const errorId = `${field.name}-error`;
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            <CreatableCombobox
              id={field.name}
              value={field.value ?? ""}
              onChange={field.onChange}
              suggestions={suggestions}
              placeholder={placeholder}
              invalid={fieldState.invalid}
              errorId={fieldState.invalid ? errorId : undefined}
            />
            {fieldState.invalid && <FieldError id={errorId} errors={[fieldState.error]} />}
          </Field>
        );
      }}
    />
  );
}

function CreatableCombobox({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  invalid,
  errorId,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  invalid?: boolean;
  errorId?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(query));
  }, [suggestions, value]);

  return (
    <Combobox
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(next) => onChange(next ?? "")}
      items={filtered}
      itemToStringLabel={(item) => item}
      isItemEqualToValue={(a, b) => a.toLowerCase() === b.toLowerCase()}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        showTrigger
        aria-invalid={invalid}
        aria-describedby={errorId}
        autoComplete="off"
      />
      <ComboboxContent>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No matches</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
