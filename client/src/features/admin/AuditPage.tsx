import { useEffect } from "react";
import { HistoryIcon, Loader2Icon } from "lucide-react";
import { SettingsNav } from "@/components/SettingsNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminConfigAudit } from "./api";

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: number | string): string {
  return new Date(value).toLocaleString();
}

function formatAuditValue(value: string | null): string {
  return value ?? "—";
}

export function AdminAuditPage() {
  const audit = useAdminConfigAudit(50);

  useEffect(() => {
    document.title = "Admin audit | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage integrations, programmatic access, and administrator-only runtime settings.
        </p>
      </div>

      <SettingsNav active="/settings/admin/audit" />

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Admin audit</h2>
        <p className="text-sm text-muted-foreground">
          Review recent runtime configuration changes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon />
            Recent changes
          </CardTitle>
          <CardDescription>Secret values are redacted by the server audit log.</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2Icon className="animate-spin" />
              Loading audit log…
            </div>
          ) : audit.isError ? (
            <p className="py-4 text-sm text-destructive">
              {formatError(audit.error, "Failed to load audit log")}
            </p>
          ) : audit.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Old value</TableHead>
                  <TableHead>New value</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.data.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(entry.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono">{entry.key}</TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-muted-foreground">
                      {formatAuditValue(entry.oldValue)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-muted-foreground">
                      {formatAuditValue(entry.newValue)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.actorUserId ?? "system"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No audit entries yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
