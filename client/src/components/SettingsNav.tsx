import { Link } from "@tanstack/react-router";
import { useCanAccessAdmin } from "@/features/admin/api";
import { cn } from "@/lib/utils";

const settingsLinks = [
  { to: "/settings/api-keys", label: "API keys" },
  { to: "/settings/integrations", label: "Integrations" },
] as const;

const adminLinks = [
  { to: "/settings/admin/configuration", label: "Configuration" },
  { to: "/settings/admin/users", label: "Users" },
  { to: "/settings/admin/audit", label: "Audit" },
] as const;

type SettingsLink = (typeof settingsLinks)[number] | (typeof adminLinks)[number];
type SettingsPath = SettingsLink["to"];

function SettingsNavLink({ item, active }: { item: SettingsLink; active: SettingsPath }) {
  return (
    <Link
      to={item.to}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active === item.to
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}

export function SettingsNav({ active }: { active: SettingsPath }) {
  const canAccessAdmin = useCanAccessAdmin();
  const showAdmin = canAccessAdmin.isSuccess;

  return (
    <nav className="flex flex-col gap-3 border-b pb-4" aria-label="Settings">
      <div className="flex flex-wrap gap-2">
        {settingsLinks.map((item) => (
          <SettingsNavLink key={item.to} item={item} active={active} />
        ))}
      </div>
      {showAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-1 text-xs font-medium text-muted-foreground uppercase">Admin</span>
          {adminLinks.map((item) => (
            <SettingsNavLink key={item.to} item={item} active={active} />
          ))}
        </div>
      ) : null}
    </nav>
  );
}
