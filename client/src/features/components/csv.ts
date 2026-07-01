import { COMPONENT_CSV_COLUMNS } from "shared";

// Header-only CSV string. Matches the import header exactly so a user can
// download this, fill in rows, and import it back without any column editing.
export function buildTemplateCsv(): string {
  return COMPONENT_CSV_COLUMNS.join(",") + "\n";
}

// Trigger a client-side download of `text` as a CSV file. Works for the
// template (and could be reused for a client-built export later).
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
