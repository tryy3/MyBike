import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, RefreshCwIcon, SaveIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { SettingsNav } from "@/components/SettingsNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  useAdminSettings,
  useRestartServer,
  useUpdateAdminSettings,
  type UpdateAdminSettingInput,
} from "./api";
import type { AdminSettingGql, AdminSettingSourceGql } from "@/lib/graphql/operations";

type DraftValue = string | boolean;
type SettingKind = "logLevel" | "boolean" | "number" | "url" | "text" | "secret";

const logLevelOptions = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;

function sourceBadgeVariant(source: AdminSettingSourceGql): "secondary" | "outline" | "success" {
  if (source === "database") return "success";
  if (source === "env") return "secondary";
  return "outline";
}

function settingKind(setting: AdminSettingGql): SettingKind {
  if (setting.isSecret) return "secret";
  if (setting.key === "logging.level") return "logLevel";
  if (typeof setting.value === "boolean") return "boolean";
  if (typeof setting.value === "number") return "number";
  if (setting.key.toLowerCase().includes("url")) return "url";
  return "text";
}

function initialDraftValue(setting: AdminSettingGql): DraftValue {
  if (setting.isSecret) return "";
  if (typeof setting.value === "boolean") return setting.value;
  if (setting.value === null || setting.value === undefined) return "";
  return String(setting.value);
}

function valueForSubmit(setting: AdminSettingGql, value: DraftValue): unknown {
  const kind = settingKind(setting);
  if (kind === "boolean") return Boolean(value);
  if (kind === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${setting.label} must be a valid number`);
    }
    return parsed;
  }
  return String(value);
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function AdminConfigurationPage() {
  const settings = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const restartServer = useRestartServer();
  const [draftValues, setDraftValues] = useState<Record<string, DraftValue>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    document.title = "Admin configuration | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  useEffect(() => {
    if (!settings.data) return;
    const nextValues: Record<string, DraftValue> = {};
    for (const setting of settings.data.settings) {
      nextValues[setting.key] = initialDraftValue(setting);
    }
    setDraftValues(nextValues);
    setDirtyKeys(new Set());
  }, [settings.data]);

  const groupedSettings = useMemo(() => {
    const groups = new Map<string, AdminSettingGql[]>();
    for (const setting of settings.data?.settings ?? []) {
      const group = groups.get(setting.group);
      if (group) {
        group.push(setting);
      } else {
        groups.set(setting.group, [setting]);
      }
    }
    return Array.from(groups.entries());
  }, [settings.data?.settings]);

  function updateDraft(setting: AdminSettingGql, value: DraftValue): void {
    setDraftValues((current) => ({ ...current, [setting.key]: value }));
    setDirtyKeys((current) => {
      const next = new Set(current);
      if (setting.isSecret && String(value).length === 0) {
        next.delete(setting.key);
      } else {
        next.add(setting.key);
      }
      return next;
    });
  }

  async function saveChanges(): Promise<void> {
    if (!settings.data) return;
    const inputs: UpdateAdminSettingInput[] = [];
    try {
      for (const setting of settings.data.settings) {
        if (!dirtyKeys.has(setting.key) || setting.source === "env") continue;
        inputs.push({
          key: setting.key,
          value: valueForSubmit(setting, draftValues[setting.key] ?? ""),
        });
      }
    } catch (error) {
      toast.error(formatError(error, "Invalid setting value"));
      return;
    }

    if (!inputs.length) return;

    try {
      await updateSettings.mutateAsync(inputs);
      toast.success("Configuration saved");
    } catch (error) {
      toast.error("Could not save configuration", {
        description: formatError(error, "Try again."),
      });
    }
  }

  async function restart(): Promise<void> {
    try {
      await restartServer.mutateAsync();
      toast.success("Restart requested", {
        description: "The server may briefly disconnect while the process restarts.",
      });
    } catch (error) {
      toast.error("Could not request restart", {
        description: formatError(error, "Try again."),
      });
    }
  }

  const dirtyCount = dirtyKeys.size;
  const isSaving = updateSettings.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage integrations, programmatic access, and administrator-only runtime settings.
        </p>
      </div>

      <SettingsNav active="/settings/admin/configuration" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Admin configuration</h2>
          <p className="text-sm text-muted-foreground">
            Runtime settings are merged from environment variables, database overrides, and
            defaults.
          </p>
        </div>
        <Button onClick={() => void saveChanges()} disabled={dirtyCount === 0 || isSaving}>
          {isSaving ? (
            <>
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <SaveIcon data-icon="inline-start" />
              Save{" "}
              {dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "changes"}
            </>
          )}
        </Button>
      </div>

      {settings.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="animate-spin" />
            Loading configuration…
          </CardContent>
        </Card>
      ) : settings.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              {formatError(settings.error, "You do not have permission to view admin settings.")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {settings.data?.pendingRestart ? (
            <Card className="border-destructive/30 bg-muted/30">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>Restart pending</CardTitle>
                  <CardDescription>
                    One or more restart-required settings have changed. Restart the server to apply
                    them.
                  </CardDescription>
                </div>
                <Button onClick={() => void restart()} disabled={restartServer.isPending}>
                  {restartServer.isPending ? (
                    <>
                      <Loader2Icon data-icon="inline-start" className="animate-spin" />
                      Requesting…
                    </>
                  ) : (
                    <>
                      <RefreshCwIcon data-icon="inline-start" />
                      Restart server
                    </>
                  )}
                </Button>
              </CardHeader>
            </Card>
          ) : null}

          {groupedSettings.map(([group, groupSettings]) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon />
                  {group}
                </CardTitle>
                <CardDescription>
                  {groupSettings.some((setting) => setting.effect === "restartRequired")
                    ? "Some settings in this group require a server restart."
                    : "Changes in this group apply without a restart."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {groupSettings.map((setting) => {
                  const kind = settingKind(setting);
                  const draftValue = draftValues[setting.key] ?? initialDraftValue(setting);
                  const disabled = setting.source === "env" || isSaving;
                  const fieldId = `admin-setting-${setting.key.replaceAll(".", "-")}`;

                  return (
                    <div
                      key={setting.key}
                      className={cn(
                        "flex flex-col gap-3 rounded-lg border p-4",
                        disabled && "bg-muted/30",
                      )}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={fieldId}>{setting.label}</Label>
                          <p className="font-mono text-xs text-muted-foreground">{setting.key}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={sourceBadgeVariant(setting.source)}>
                            Source: {setting.source}
                          </Badge>
                          <Badge
                            variant={setting.effect === "restartRequired" ? "secondary" : "outline"}
                          >
                            {setting.effect === "restartRequired"
                              ? "Restart required"
                              : "Hot reload"}
                          </Badge>
                        </div>
                      </div>

                      {kind === "logLevel" ? (
                        <Select
                          value={String(draftValue)}
                          disabled={disabled}
                          onValueChange={(value) => updateDraft(setting, value)}
                        >
                          <SelectTrigger id={fieldId} className="w-full sm:max-w-xs">
                            <SelectValue placeholder="Select log level" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {logLevelOptions.map((level) => (
                                <SelectItem key={level} value={level}>
                                  {level}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : kind === "boolean" ? (
                        <div className="flex items-center gap-3">
                          <Switch
                            id={fieldId}
                            checked={Boolean(draftValue)}
                            disabled={disabled}
                            onCheckedChange={(checked) => updateDraft(setting, checked)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {draftValue ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      ) : (
                        <Input
                          id={fieldId}
                          type={
                            kind === "number"
                              ? "number"
                              : kind === "secret"
                                ? "password"
                                : kind === "url"
                                  ? "url"
                                  : "text"
                          }
                          inputMode={kind === "number" ? "numeric" : undefined}
                          value={String(draftValue)}
                          disabled={disabled}
                          placeholder={
                            kind === "secret" ? (setting.isSet ? "••••" : "not set") : "Enter value"
                          }
                          autoComplete="off"
                          onChange={(event) => updateDraft(setting, event.target.value)}
                        />
                      )}

                      {setting.isSecret ? (
                        <p className="text-xs text-muted-foreground">
                          Current value: {setting.isSet ? "••••" : "not set"}. Type a new value only
                          when rotating this secret.
                        </p>
                      ) : null}
                      {setting.source === "env" ? (
                        <p className="text-xs text-muted-foreground">
                          {setting.envVar
                            ? `${setting.envVar} is set, so the environment value wins and this field is read-only.`
                            : "This value is controlled by the environment and is read-only."}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                Environment values override database values; database values override defaults.
              </CardFooter>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
