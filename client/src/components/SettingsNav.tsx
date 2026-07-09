import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const settingsLinks = [
  { to: "/settings/api-keys", label: "API keys" },
  { to: "/settings/integrations", label: "Integrations" },
] as const;

export function SettingsNav({ active }: { active: (typeof settingsLinks)[number]["to"] }) {
  return (
    <nav className="flex flex-wrap gap-2 border-b pb-4">
      {settingsLinks.map((item) => (
        <Link
          key={item.to}
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
      ))}
    </nav>
  );
}
