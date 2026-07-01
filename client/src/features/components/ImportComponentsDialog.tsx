import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, FileUpIcon, UploadIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, type ImportRowError } from "@/lib/api";
import { useImportComponents } from "./api";

interface ImportComponentsDialogProps {
  bikeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportComponentsDialog({
  bikeId,
  open,
  onOpenChange,
}: ImportComponentsDialogProps) {
  const importMut = useImportComponents(bikeId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // Server dry-run validation result, shown so the user knows what they are
  // about to commit before clicking through the confirmation popup.
  const [preview, setPreview] = useState<{
    inserted: number;
    updated: number;
  } | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [confirming, setConfirming] = useState(false);

  function reset(): void {
    setCsv(null);
    setFileName(null);
    setPreview(null);
    setRowErrors([]);
    setConfirming(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    importMut.reset();
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) {
      setCsv(null);
      setFileName(null);
      setPreview(null);
      setRowErrors([]);
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setPreview(null);
    setRowErrors([]);
    // Ask the server for a dry-run preview so the counts are authoritative
    // (proper CSV parsing + validation, including existing-id resolution).
    try {
      const result = await importMut.mutateAsync({ csv: text, dryRun: true });
      setPreview({ inserted: result.inserted, updated: result.updated });
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setRowErrors(err.details as ImportRowError[]);
      } else if (err instanceof Error) {
        setRowErrors([{ row: 0, message: err.message }]);
      }
    }
  }

  async function runImport(): Promise<void> {
    if (!csv) return;
    try {
      const result = await importMut.mutateAsync({ csv, dryRun: false });
      const total = result.inserted + result.updated;
      toast.success(
        `Imported ${result.inserted} new and updated ${result.updated} existing component${total === 1 ? "" : "s"}`,
      );
      onOpenChange(false);
    } catch (err) {
      const next: ImportRowError[] =
        err instanceof ApiError && Array.isArray(err.details)
          ? (err.details as ImportRowError[])
          : [
              {
                row: 0,
                message: err instanceof Error ? err.message : "Import failed",
              },
            ];
      setRowErrors(next);
      setConfirming(false);
      toast.error("Import failed", {
        description: `${next.length} ${next.length === 1 ? "problem" : "problems"} found. See details below.`,
      });
    }
  }

  const previewing = importMut.isPending;
  const total = preview ? preview.inserted + preview.updated : 0;
  const canConfirm = !!csv && !!preview && total > 0 && rowErrors.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import components from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns{" "}
              <code className="text-xs">
                {`id,category,name,brand,model,notes,isActive`}
              </code>
              . Leave the <code className="text-xs">id</code> column empty to
              add a new component; fill it in to update an existing one. The
              first row must be the header. Max 1000 rows.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted">
              <FileUpIcon className="size-6" />
              <span className="font-medium text-foreground">
                {fileName ?? "Choose a CSV file"}
              </span>
              <span className="text-xs">Click to browse</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={handleFileChange}
              />
            </label>

            {previewing && (
              <p className="text-sm text-muted-foreground">
                {csv ? "Validating…" : "Loading…"}
              </p>
            )}

            {preview &&
              rowErrors.length === 0 &&
              (total > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
                  <AlertTriangleIcon className="mt-0.5 size-4 text-muted-foreground" />
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">
                      {total} row{total === 1 ? "" : "s"} will be applied:
                    </span>
                    <span className="text-muted-foreground">
                      {preview.inserted} new component
                      {preview.inserted === 1 ? "" : "s"} · {preview.updated}{" "}
                      update{preview.updated === 1 ? "" : "s"}.
                    </span>
                    {preview.inserted > 0 && (
                      <span className="text-xs text-muted-foreground">
                        New components imported as the first in their category
                        become active automatically.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No changes — the file contains no inserts or updates.
                </p>
              ))}
          </div>

          {rowErrors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="mb-2 text-sm font-medium text-destructive">
                {rowErrors.length} issue
                {rowErrors.length === 1 ? "" : "s"} found:
              </p>
              <ul className="flex flex-col gap-1 text-xs">
                {rowErrors.map((e, idx) => (
                  <li key={idx} className="text-muted-foreground">
                    {e.row > 0 ? (
                      <span>
                        <span className="font-medium text-foreground">
                          Row {e.row}:
                        </span>{" "}
                      </span>
                    ) : null}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={previewing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => setConfirming(true)}
              disabled={!canConfirm || previewing}
            >
              <UploadIcon />
              Review import
            </Button>
          </DialogFooter>

          <p className="text-xs text-muted-foreground">
            Don't have a file yet? Export this bike's components first to get a
            CSV in the right format, then edit it.
          </p>
        </DialogContent>
      </Dialog>

      {/* Final confirmation gate — commits the import. */}
      <AlertDialog
        open={confirming}
        onOpenChange={(o) => {
          if (!o && !importMut.isPending) setConfirming(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm import?</AlertDialogTitle>
            <AlertDialogDescription>
              {preview
                ? `This will insert ${preview.inserted} new and update ${preview.updated} existing component${preview.inserted + preview.updated === 1 ? "" : "s"}. Existing active components in imported categories may be deactivated to satisfy the one-active-per-category rule. This cannot be undone.`
                : "This will apply the changes from your CSV. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                disabled={importMut.isPending}
                onClick={() => {
                  void runImport();
                }}
              >
                {importMut.isPending ? "Importing…" : "Confirm import"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
