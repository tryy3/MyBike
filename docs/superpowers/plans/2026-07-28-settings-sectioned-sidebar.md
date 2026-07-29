# Settings Sectioned Sidebar Implementation Plan

> **Status: COMPLETE (implemented on this branch).** Do not re-execute unchecked task boxes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace settings chip-row navigation with a sectioned sidebar (Account / Admin) that scales for future settings pages.

**Architecture:** Extract a pure sectioned nav config + filter helper; rewrite `SettingsNav` as responsive sectioned page links; add `SettingsLayout` that owns the shared Settings header + nav + children; migrate all five settings pages to render only page-specific content inside that shell.

**Spec:** `docs/superpowers/specs/2026-07-28-settings-sectioned-sidebar-design.md`

**Tech Stack:** React 19, TanStack Router `Link`, Tailwind v4, existing `useCanAccessAdmin`, Vite+ tests (`vite-plus/test`).

## Global Constraints

- Client-only; no route path, server, or GraphQL changes
- Section labels are never interactive (not links/buttons)
- Admin section only when `useCanAccessAdmin().isSuccess`
- No pill chip styling for nav items
- Desktop (`md+`): vertical sidebar sections; mobile: horizontal scroll of grouped page links
- Active link uses `aria-current="page"` via TanStack `Link`
- Shared Settings subtitle (one string for all pages): `Manage integrations, programmatic access, and administrator settings.`

## File map

| File                                                | Responsibility                                            |
| --------------------------------------------------- | --------------------------------------------------------- |
| `client/src/components/settings-nav-config.ts`      | Sectioned nav data + `visibleSettingsSections(showAdmin)` |
| `client/src/components/settings-nav-config.test.ts` | Unit tests for visibility filter                          |
| `client/src/components/SettingsNav.tsx`             | Sectioned responsive nav UI                               |
| `client/src/components/SettingsLayout.tsx`          | Shared header + nav + children shell                      |
| `client/src/routes/api-keys.tsx`                    | Drop duplicated header/nav; wrap in layout                |
| `client/src/routes/integrations.tsx`                | Same                                                      |
| `client/src/features/admin/ConfigurationPage.tsx`   | Same                                                      |
| `client/src/features/admin/UsersPage.tsx`           | Same                                                      |
| `client/src/features/admin/AuditPage.tsx`           | Same                                                      |

---

### Task 1: Nav config + unit tests

**Files:**

- Create: `client/src/components/settings-nav-config.ts`
- Create: `client/src/components/settings-nav-config.test.ts`

**Interfaces:**

- Produces:
  - `SettingsPath` — union of all settings route paths
  - `SettingsNavItem` — `{ to: SettingsPath; label: string }`
  - `SettingsNavSection` — `{ id: string; label: string; items: readonly SettingsNavItem[] }`
  - `SETTINGS_NAV_SECTIONS: readonly SettingsNavSection[]`
  - `visibleSettingsSections(showAdmin: boolean): SettingsNavSection[]`

- [ ] **Step 1: Write the failing test**

Create `client/src/components/settings-nav-config.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { SETTINGS_NAV_SECTIONS, visibleSettingsSections } from "./settings-nav-config";

describe("visibleSettingsSections", () => {
  it("always includes Account with api-keys and integrations", () => {
    const sections = visibleSettingsSections(false);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe("account");
    expect(sections[0]?.items.map((i) => i.to)).toEqual([
      "/settings/api-keys",
      "/settings/integrations",
    ]);
  });

  it("appends Admin section when showAdmin is true", () => {
    const sections = visibleSettingsSections(true);
    expect(sections.map((s) => s.id)).toEqual(["account", "admin"]);
    expect(sections[1]?.items.map((i) => i.to)).toEqual([
      "/settings/admin/configuration",
      "/settings/admin/users",
      "/settings/admin/audit",
    ]);
  });

  it("keeps SETTINGS_NAV_SECTIONS as the full unfiltered source", () => {
    expect(SETTINGS_NAV_SECTIONS.map((s) => s.id)).toEqual(["account", "admin"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w client -- src/components/settings-nav-config.test.ts`

Expected: FAIL (module not found / export missing)

- [ ] **Step 3: Write minimal implementation**

Create `client/src/components/settings-nav-config.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w client -- src/components/settings-nav-config.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/settings-nav-config.ts client/src/components/settings-nav-config.test.ts
git commit -m "$(cat <<'EOF'
feat(client): add sectioned settings nav config

EOF
)"
```

---

### Task 2: SettingsNav + SettingsLayout UI

**Files:**

- Modify: `client/src/components/SettingsNav.tsx` (full rewrite)
- Create: `client/src/components/SettingsLayout.tsx`

**Interfaces:**

- Consumes: `visibleSettingsSections`, `SettingsPath` from `settings-nav-config.ts`; `useCanAccessAdmin` from `@/features/admin/api`
- Produces:
  - `SettingsNav({ active }: { active: SettingsPath })`
  - `SettingsLayout({ active, children }: { active: SettingsPath; children: React.ReactNode })`

- [ ] **Step 1: Rewrite `SettingsNav.tsx`**

Replace the file with:

```tsx
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
```

Notes for implementer:

- Section labels use `<p>`, never `<button>` / `<a>` / `Link`
- Do not reintroduce chip wrap-rows or an inline “Admin” chip
- Keep `hidden md:flex` / `md:hidden` split so only one nav mode is visible

- [ ] **Step 2: Create `SettingsLayout.tsx`**

```tsx
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
```

- [ ] **Step 3: Typecheck the new components**

Run: `vp check`

Expected: PASS for these files (pages still import old `SettingsNav` API which remains compatible via `{ active }`)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/SettingsNav.tsx client/src/components/SettingsLayout.tsx
git commit -m "$(cat <<'EOF'
feat(client): add sectioned settings sidebar layout

EOF
)"
```

---

### Task 3: Migrate all settings pages onto SettingsLayout

**Files:**

- Modify: `client/src/routes/api-keys.tsx`
- Modify: `client/src/routes/integrations.tsx`
- Modify: `client/src/features/admin/ConfigurationPage.tsx`
- Modify: `client/src/features/admin/UsersPage.tsx`
- Modify: `client/src/features/admin/AuditPage.tsx`

**Interfaces:**

- Consumes: `SettingsLayout` with `active` set to that page’s path
- Each page keeps its own `document.title` effect and page-specific `h2` + body

For **each** of the five pages, apply the same structural change:

1. Replace `import { SettingsNav } from "@/components/SettingsNav"` with `import { SettingsLayout } from "@/components/SettingsLayout"`
2. Remove the duplicated block:

```tsx
<div className="flex flex-col gap-1">
  <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
  <p className="text-sm text-muted-foreground">…</p>
</div>

<SettingsNav active="…" />
```

3. Wrap the remaining page content (page `h2`/description + cards/tables) in:

```tsx
<SettingsLayout active="…">{/* existing page-specific content */}</SettingsLayout>
```

Exact `active` values:

| File                    | `active`                          |
| ----------------------- | --------------------------------- |
| `api-keys.tsx`          | `"/settings/api-keys"`            |
| `integrations.tsx`      | `"/settings/integrations"`        |
| `ConfigurationPage.tsx` | `"/settings/admin/configuration"` |
| `UsersPage.tsx`         | `"/settings/admin/users"`         |
| `AuditPage.tsx`         | `"/settings/admin/audit"`         |

Example for `AuditPage.tsx` after migration (pattern for all pages):

```tsx
return (
  <SettingsLayout active="/settings/admin/audit">
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold tracking-tight">Admin audit</h2>
      <p className="text-sm text-muted-foreground">Review recent runtime configuration changes.</p>
    </div>

    <Card>{/* unchanged body */}</Card>
  </SettingsLayout>
);
```

- [ ] **Step 1: Migrate `api-keys.tsx` and `integrations.tsx`**
- [ ] **Step 2: Migrate `ConfigurationPage.tsx`, `UsersPage.tsx`, `AuditPage.tsx`**
- [ ] **Step 3: Grep for leftover usages**

Run: `rg "SettingsNav|text-2xl.*Settings" client/src --glob '*.tsx'`

Expected:

- `SettingsNav` only referenced from `SettingsLayout.tsx` (and its own file)
- No page-level `<h1>…Settings</h1>` left under settings routes/admin pages

- [ ] **Step 4: Commit**

```bash
git add \
  client/src/routes/api-keys.tsx \
  client/src/routes/integrations.tsx \
  client/src/features/admin/ConfigurationPage.tsx \
  client/src/features/admin/UsersPage.tsx \
  client/src/features/admin/AuditPage.tsx
git commit -m "$(cat <<'EOF'
refactor(client): use SettingsLayout on all settings pages

EOF
)"
```

---

### Task 4: Verify

**Files:** none (verification only)

- [ ] **Step 1: Run automated checks**

Run:

```bash
npm test -w client -- src/components/settings-nav-config.test.ts
vp check
```

Expected: tests PASS; `vp check` PASS

- [ ] **Step 2: Manual UI checklist**

With `npm run -w server dev` and `npm run -w client dev`:

1. Non-admin session: Settings shows only **Account** (API keys, Integrations); no Admin heading
2. Admin session: **Account** + **Admin** sections; Admin label is not clickable
3. Click each of the five links — correct page, active row highlighted, URL unchanged from today
4. Resize below `md`: nav becomes horizontal grouped links above content; above `md`: sidebar returns
5. Deep-link `/settings/admin/configuration` still works for admin

- [ ] **Step 3: Commit only if Step 1–2 caused follow-up fixes**

If fixes were needed, commit them separately with a clear message (e.g. `fix(client): …`). Otherwise no extra commit.

---

## Spec coverage self-check

| Spec requirement                          | Task                                     |
| ----------------------------------------- | ---------------------------------------- |
| Sectioned Account / Admin IA              | Task 1 config                            |
| Admin gated by `useCanAccessAdmin`        | Task 2 `SettingsNav`                     |
| Section labels non-interactive            | Task 2 `<p>` labels                      |
| Desktop sidebar + mobile horizontal pages | Task 2 dual layout                       |
| Shared Settings header once               | Task 2 `SettingsLayout` + Task 3 migrate |
| Routes unchanged                          | All tasks (no router edits)              |
| Out of scope: new pages / server          | Not in plan                              |
| Verification                              | Task 4                                   |

## Placeholder / consistency self-check

- No TBD/TODO placeholders
- `SettingsPath` / `active` values match existing routes
- Subtitle string fixed in Global Constraints and `SettingsLayout`
- `SettingsNav` remains exported for layout use; pages consume `SettingsLayout` only after Task 3
