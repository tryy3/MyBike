/**
 * Normalize mutation result counts across local Turso Database and remote
 * serverless (compat libSQL). Local uses `changes`; remote uses `rowsAffected`.
 */
export function affectedRows(result: {
  changes?: number | bigint | null;
  rowsAffected?: number | bigint | null;
}): number {
  const value = result.changes ?? result.rowsAffected ?? 0;
  return typeof value === "bigint" ? Number(value) : value;
}

type NamedResultSet = {
  columns: string[];
  rows: unknown[];
};

/**
 * Make Turso serverless/compat named column properties enumerable.
 *
 * Compat rows are arrays with non-enumerable column names. drizzle-orm/libsql's
 * `normalizeRow` only copies enumerable keys, so raw `db.all(sql\`…\`)` would
 * otherwise lose `name`/`email`/… and GraphQL fields resolve to null.
 *
 * Mapped `select()` queries still need array index access (`row[0]`), so we keep
 * the array shape and only flip named properties to enumerable.
 */
export function enumerableNamedRows<T extends NamedResultSet>(result: T): T {
  const { columns, rows } = result;
  return {
    ...result,
    rows: rows.map((row) => withEnumerableColumnNames(row, columns)),
  };
}

function withEnumerableColumnNames(row: unknown, columns: string[]): unknown {
  if (row == null || typeof row !== "object") {
    return row;
  }

  const base = Array.isArray(row) ? [...row] : Object.assign([], row as object);
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i]!;
    const value =
      column in (row as object)
        ? (row as Record<string, unknown>)[column]
        : Array.isArray(row)
          ? row[i]
          : undefined;
    Object.defineProperty(base, column, {
      value,
      enumerable: true,
      writable: false,
      configurable: true,
    });
  }
  return base;
}
