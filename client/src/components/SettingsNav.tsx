import { Link } from "@tanstack/react-router";
import { useCanAccessAdmin } from "@/features/admin/api";
import { cn } from "@/lib/utils";
import {
  type SettingsNavItem,
  type SettingsPath,
  visibleSettingsSections,
} from "./settings-nav-config";

function SettingsNavLink({
  item,
  active,
  className,
}: {
  item: SettingsNavItem;
  active: SettingsPath;
  className?: string;
}) {
  const isActive = active === item.to;
  return (
    <Link
      to={item.to}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {isActive ? (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-foreground md:block hidden"
        />
      ) : null}
      {item.label}
    </Link>
  );
}

export function SettingsNav({ active }: { active: SettingsPath }) {
  const canAccessAdmin = useCanAccessAdmin();
  const sections = visibleSettingsSections(canAccessAdmin.isSuccess);

  return (
    <nav aria-label="Settings" className="flex flex-col gap-4">
      {/* Mobile: horizontal grouped links */}
      <div className="flex gap-4 overflow-x-auto pb-1 md:hidden">
        {sections.map((section) => (
          <div key={section.id} className="flex shrink-0 flex-col gap-1">
            <p className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.label}
            </p>
            <div className="flex gap-1">
              {section.items.map((item) => (
                <SettingsNavLink
                  key={item.to}
                  item={item}
                  active={active}
                  className="whitespace-nowrap"
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: vertical sectioned sidebar */}
      <div className="hidden md:flex md:w-44 md:shrink-0 md:flex-col md:gap-6">
        {sections.map((section) => (
          <div key={section.id} className="flex flex-col gap-1">
            <p className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <SettingsNavLink key={item.to} item={item} active={active} className="pl-3" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
