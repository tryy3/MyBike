import type { ReactNode } from "react";
import { SettingsNav } from "./SettingsNav";
import type { SettingsPath } from "./settings-nav-config";

export function SettingsLayout({
  active,
  children,
}: {
  active: SettingsPath;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage integrations, programmatic access, and administrator settings.
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <SettingsNav active={active} />
        <div className="min-w-0 flex-1 flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}
