# Settings sectioned sidebar navigation

> **Status: IMPLEMENTED.**

**Date:** 2026-07-28  
**Status:** Approved  
**Scope:** Client settings UI navigation only (`SettingsNav` + settings pages)

## Problem

Settings navigation is two wrap-rows of chip-style links. The “Admin” label sits inline with the same chip styling as real links, so it reads as a button. The pattern does not match bike-detail page tabs, and it does not scale cleanly for more settings sections.

## Goal

Replace chip rows with a **sectioned sidebar** so:

- Section labels (e.g. Admin) are plain text, never interactive
- Navigation items read as **pages**, not buttons
- New sections/pages can be added as data later without redesigning the shell

## Decision

**Approach B — Sectioned sidebar** (chosen over flat tabs and nested-admin tabs).

Routes stay unchanged. Admin visibility stays gated by `useCanAccessAdmin`.

## Information architecture

| Section     | Pages                                                                    | Visibility                             |
| ----------- | ------------------------------------------------------------------------ | -------------------------------------- |
| **Account** | API keys (`/settings/api-keys`), Integrations (`/settings/integrations`) | Always (authenticated)                 |
| **Admin**   | Configuration, Users, Audit under `/settings/admin/*`                    | Only when `useCanAccessAdmin` succeeds |

No URL nesting changes. Deep links continue to work.

## Layout

### Shared shell

Every settings page uses a shared shell:

1. Page header: title “Settings” + short subtitle (once, not duplicated per page)
2. Desktop (`md+`): two columns — left nav (~180px) + right page content
3. Page body: page-specific `h2`/description + existing forms/tables/cards

### Nav look

- Section labels: small uppercase muted text; not links or buttons
- Items: full-width link rows with hover fill; active state via left bar and/or muted background (vertical page-nav / line-tab feel)
- No pill chips (`rounded-md bg-muted` row of buttons)

### Mobile (`< md`)

Nav stacks above content as a **horizontal scroll of page links**, still grouped (Account then Admin). Prefer page links over a dropdown so the metaphor stays “tabs/pages.” Sidebar returns at `md+`.

## Implementation shape

1. Introduce a thin settings layout wrapper (expand `SettingsNav` or add `SettingsLayout`) that renders header + sectioned nav + `children`.
2. Refactor settings pages (API keys, Integrations, Configuration, Users, Audit) to render only page-specific content inside the shell — remove duplicated Settings header + bare nav.
3. Represent nav as sectioned config, e.g. `{ id, label, items: [{ to, label }] }[]`, so future sections are data.
4. Keep admin section gated by existing `useCanAccessAdmin`.

### Accessibility

- `<nav aria-label="Settings">`
- Section headings are non-interactive text
- Active route uses `aria-current="page"` (TanStack `Link`)

## Out of scope

- Route path changes
- New settings pages or admin features
- App header / global nav changes
- Server or GraphQL changes

## Verification

- `vp check` for client (format/lint/types)
- Manual: non-admin sees only Account; admin sees Account + Admin; each deep link highlights the correct item and shows the correct page

## Alternatives considered

| Option             | Why not                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| **A Flat tabs**    | Matches bike tabs quickly but flattens Account vs Admin                 |
| **C Nested admin** | Stronger separation but extra click and deeper IA for little gain today |
