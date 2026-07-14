export function pickFields<T extends Record<string, unknown>>(
  value: T,
  fields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.includes(".")) {
      const [head, ...rest] = field.split(".");
      const nestedField = rest.join(".");
      const nestedValue = value[head];
      if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
        result[head] = {
          ...(typeof result[head] === "object" && result[head] !== null
            ? (result[head] as Record<string, unknown>)
            : {}),
          ...pickFields(nestedValue as Record<string, unknown>, [nestedField]),
        };
      } else if (nestedValue !== undefined) {
        result[head] = nestedValue;
      }
      continue;
    }

    if (field in value) {
      result[field] = value[field];
    }
  }
  return result;
}

export function pickFieldsList<T extends Record<string, unknown>>(
  values: T[],
  fields: string[],
): Record<string, unknown>[] {
  return values.map((value) => pickFields(value, fields));
}

export function stripTypenames(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripTypenames);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (key === "__typename") continue;
      next[key] = stripTypenames(nested);
    }
    return next;
  }
  return value;
}
