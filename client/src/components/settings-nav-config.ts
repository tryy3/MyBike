export const SETTINGS_NAV_SECTIONS = [
  {
    id: "account",
    label: "Account",
    items: [
      { to: "/settings/api-keys", label: "API keys" },
      { to: "/settings/integrations", label: "Integrations" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { to: "/settings/admin/configuration", label: "Configuration" },
      { to: "/settings/admin/users", label: "Users" },
      { to: "/settings/admin/audit", label: "Audit" },
    ],
  },
] as const;

export type SettingsNavSection = (typeof SETTINGS_NAV_SECTIONS)[number];
export type SettingsNavItem = SettingsNavSection["items"][number];
export type SettingsPath = SettingsNavItem["to"];

export function visibleSettingsSections(showAdmin: boolean): SettingsNavSection[] {
  if (showAdmin) {
    return [...SETTINGS_NAV_SECTIONS];
  }
  return SETTINGS_NAV_SECTIONS.filter((section) => section.id !== "admin");
}
