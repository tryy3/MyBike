import { useEffect, useMemo, useState, type ComponentType, type SVGProps } from "react";
import {
  ChevronDownIcon,
  HexagonIcon,
  Loader2Icon,
  MonitorIcon,
  RefreshCwIcon,
  SaveIcon,
  ScrollTextIcon,
  ShieldIcon,
  TimerIcon,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
import type { AdminSettingGql } from "@/lib/graphql/operations";

type DraftValue = string | boolean;
type SettingKind = "logLevel" | "boolean" | "number" | "url" | "text" | "secret";
type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

const logLevelOptions = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;

const logLevelDotClass: Record<(typeof logLevelOptions)[number], string> = {
  trace: "bg-muted-foreground/50",
  debug: "bg-chart-6",
  info: "bg-chart-1",
  warn: "bg-chart-4",
  error: "bg-chart-5",
  fatal: "bg-destructive",
  silent: "bg-muted-foreground/30",
};

const groupIcons: Record<string, IconComponent> = {
  Logging: ScrollTextIcon,
  GraphQL: HexagonIcon,
  "Strava webhook": TimerIcon,
  Authentication: ShieldIcon,
  Client: MonitorIcon,
};

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

function SettingControl({
  setting,
  draftValue,
  disabled,
  fieldId,
  onChange,
}: {
  setting: AdminSettingGql;
  draftValue: DraftValue;
  disabled: boolean;
  fieldId: string;
  onChange: (value: DraftValue) => void;
}) {
  const kind = settingKind(setting);

  if (kind === "logLevel") {
    const level = String(draftValue) as (typeof logLevelOptions)[number];
    return (
      <Select value={String(draftValue)} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger id={fieldId} className="w-[9.5rem]">
          <SelectValue placeholder="Select log level">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  logLevelDotClass[level] ?? "bg-chart-1",
                )}
                aria-hidden
              />
              {String(draftValue)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {logLevelOptions.map((option) => (
              <SelectItem key={option} value={option}>
                <span className="flex items-center gap-2">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", logLevelDotClass[option])}
                    aria-hidden
                  />
                  {option}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  if (kind === "boolean") {
    return (
      <Switch
        id={fieldId}
        checked={Boolean(draftValue)}
        disabled={disabled}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-chart-1"
        aria-label={setting.label}
      />
    );
  }

  return (
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
      placeholder={kind === "secret" ? (setting.isSet ? "••••" : "not set") : "Enter value"}
      autoComplete="off"
      className="w-full sm:w-56"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SettingRow({
  setting,
  draftValue,
  disabled,
  isSaving,
  open,
  onOpenChange,
  onChange,
}: {
  setting: AdminSettingGql;
  draftValue: DraftValue;
  disabled: boolean;
  isSaving: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: DraftValue) => void;
}) {
  const fieldId = `admin-setting-${setting.key.replaceAll(".", "-")}`;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div
        className={cn(
          "rounded-lg transition-colors",
          open && "bg-chart-1/5",
          disabled && "opacity-80",
        )}
      >
        <div
          role="button"
          tabIndex={0}
          className="flex cursor-pointer items-center justify-between gap-4 px-2.5 py-1.5"
          onClick={() => onOpenChange(!open)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenChange(!open);
            }
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={fieldId}
                className="text-[13px] font-medium leading-5"
                onClick={(event) => event.stopPropagation()}
              >
                {setting.label}
              </label>
              {setting.effect === "restartRequired" ? (
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  Restart required
                </span>
              ) : null}
              {setting.source === "database" ? (
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  database
                </span>
              ) : null}
              {setting.source === "env" ? (
                <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                  env
                </span>
              ) : null}
              <ChevronDownIcon
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
                aria-hidden
              />
            </div>
            <p className="text-xs text-muted-foreground">{setting.description}</p>
          </div>
          <div
            className="shrink-0"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <SettingControl
              setting={setting}
              draftValue={draftValue}
              disabled={disabled || isSaving}
              fieldId={fieldId}
              onChange={onChange}
            />
          </div>
        </div>

        <CollapsibleContent>
          <div className="mx-2.5 flex flex-col gap-2 pt-1 pb-2.5 mb-1.5">
            <Separator />
            <div>
              <p className="font-mono text-xs text-chart-1">{setting.key}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {setting.effect === "restartRequired"
                  ? "Needs a server restart to apply."
                  : "Applies without a restart."}
              </p>
              {setting.isSecret ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Current value: {setting.isSet ? "••••" : "not set"}. Type a new value only when
                  rotating this secret.
                </p>
              ) : null}
              {setting.source === "env" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {setting.envVar
                    ? `${setting.envVar} is set, so the environment value wins and this field is read-only.`
                    : "This value is controlled by the environment and is read-only."}
                </p>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function AdminConfigurationPage() {
  const settings = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const restartServer = useRestartServer();
  const [draftValues, setDraftValues] = useState<Record<string, DraftValue>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

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

  const filteredSettings = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const list = settings.data?.settings ?? [];
    if (!query) return list;
    return list.filter((setting) => {
      const hay = `${setting.label} ${setting.key} ${setting.description} ${setting.group}`;
      return hay.toLowerCase().includes(query);
    });
  }, [filter, settings.data?.settings]);

  const groupedSettings = useMemo(() => {
    const groups = new Map<string, AdminSettingGql[]>();
    for (const setting of filteredSettings) {
      const group = groups.get(setting.group);
      if (group) {
        group.push(setting);
      } else {
        groups.set(setting.group, [setting]);
      }
    }
    return Array.from(groups.entries());
  }, [filteredSettings]);

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

  function setRowOpen(key: string, open: boolean): void {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
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
    <SettingsLayout active="/settings/admin/configuration">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Admin configuration</h2>
          <p className="text-sm text-muted-foreground">
            Runtime settings merge from environment, database overrides, and defaults.
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

          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>Runtime settings</CardTitle>
                <CardDescription>
                  Precedence:{" "}
                  <span className="font-medium text-sky-700 dark:text-sky-400">env</span>
                  {" > "}
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    database
                  </span>
                  {" > "}
                  <span className="text-muted-foreground">default</span>
                </CardDescription>
              </div>
              <Input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by label or key…"
                aria-label="Filter settings"
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-1 pb-4">
              {groupedSettings.length === 0 ? (
                <p className="px-1 py-6 text-sm text-muted-foreground">
                  No settings match this filter.
                </p>
              ) : (
                groupedSettings.map(([group, groupSettings], groupIndex) => {
                  const Icon = groupIcons[group] ?? ScrollTextIcon;
                  return (
                    <section key={group} className={cn(groupIndex > 0 && "mt-4")}>
                      <div className="mb-0.5 flex items-center gap-2.5 px-1">
                        <span className="flex size-7 items-center justify-center rounded-md bg-chart-1/15 text-chart-1">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <h3 className="text-base font-semibold text-chart-1">{group}</h3>
                      </div>
                      <div className="ml-2 flex flex-col border-l-2 border-chart-1/35 pl-1">
                        {groupSettings.map((setting) => (
                          <SettingRow
                            key={setting.key}
                            setting={setting}
                            draftValue={draftValues[setting.key] ?? initialDraftValue(setting)}
                            disabled={setting.source === "env"}
                            isSaving={isSaving}
                            open={openKeys.has(setting.key)}
                            onOpenChange={(open) => setRowOpen(setting.key, open)}
                            onChange={(value) => updateDraft(setting, value)}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </SettingsLayout>
  );
}
