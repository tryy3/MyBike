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
