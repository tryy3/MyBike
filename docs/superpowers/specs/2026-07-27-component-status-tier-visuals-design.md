# Component Status Tier Visuals

**Date:** 2026-07-27  
**Status:** Approved (brainstorming)  
**Builds on:** `2026-07-26-component-archive-design.md` (three-section Active / Alternates / Archived list)

## Summary

Differentiate the three component status sections in the category detail panel so **Active** dominates, **Alternates** stay easy to scan (especially for chain rotation), and **Archived** stays available but out of the way via a collapsed disclosure.

Approach: **Accent rail** — Active rows get a left accent bar + light fill; section headers use icons and weight hierarchy; Archived collapses by default.

## Goals

- Clear visual hierarchy: Active > Alternates > Archived
- Archived collapsed by default behind `Archived · N`
- Remove redundant Active / Archived badges inside sectioned lists
- Client-only change in `CategoryDetailContent` (no API/schema work)

## Non-goals

- Persisting archived open/closed across reloads or categories
- Filtering, search, or hiding archived entirely
- Changing archive/activate/unarchive rules or GraphQL
- Mobile-only alternate layout (same hierarchy on all breakpoints)
- New design-system primitives beyond local section/row classes

## Revises prior design

`2026-07-26-component-archive-design.md` listed as a non-goal:

> Hiding archived by default or collapsing cluttered lists (revisit later)

This spec is that revisit: archived remains in the UI, but collapsed by default.

## Visual spec

### Section headers

| Section    | Icon                    | Label treatment                                      |
| ---------- | ----------------------- | ---------------------------------------------------- |
| Active     | `CheckIcon`             | Accent-colored uppercase label (`text-primary`)      |
| Alternates | `LayersIcon`            | Muted uppercase label + count when `N > 0`           |
| Archived   | `ArchiveIcon` + chevron | Tertiary uppercase label + count; disclosure control |

### Lists & rows

| Section    | List chrome                                 | Row chrome                                    |
| ---------- | ------------------------------------------- | --------------------------------------------- |
| Active     | Solid `rounded-lg border`                   | `border-l-3 border-l-primary` + `bg-muted/40` |
| Alternates | Solid `rounded-lg border`                   | Flat (no accent rail, no fill)                |
| Archived   | Dashed border + `bg-muted/20` when expanded | Muted text; no accent rail                    |

Use existing theme tokens (`primary`, `muted-foreground`, `border`, `muted`). No new brand colors.

### Badges

- Drop the per-row **Active** badge when the row is inside the Active section.
- Drop the per-row **Archived** badge when the row is inside the Archived section.
- Status is conveyed by section membership + chrome.

### Archived disclosure

- Default: **collapsed**
- Control: button/row with chevron, archive icon, “Archived”, and count
- `aria-expanded` on the control; expand reveals the existing archived list + actions
- Expand state: component `useState` in `CategoryDetailContent` — resets when leaving the category detail (no localStorage)
- When there are zero archived components, omit the control entirely (same as today’s empty-section omission)

### Actions (unchanged)

| Section    | Actions                               |
| ---------- | ------------------------------------- |
| Active     | Edit, Delete (no archive)             |
| Alternates | Use this, Archive, Edit, Delete       |
| Archived   | Unarchive, Edit, Delete (no Use this) |

Drag-reorder behavior unchanged for all visible rows (including expanded archived).

## Implementation notes

Primary file: `client/src/features/components/CategoryDetailContent.tsx`

Suggested structure:

1. Small `StatusSectionHeader` (or inline) for Active / Alternates icon + label.
2. Archived as a disclosure (`useState` + button + conditional list).
3. Extend `ComponentRow` / list wrappers with accent-rail / muted styling props as needed; remove badge rendering for active/archived when section implies status.

Icons: `lucide-react` (`CheckIcon`, `Layers2Icon` or `LayersIcon`, `ArchiveIcon`, `ChevronRightIcon`).

## Testing

- Manual: category with active + alternates + archived — Active rail visible, Alternates flat, Archived closed by default, expand shows muted dashed list, actions still work.
- No mandatory new unit/Playwright coverage for pure presentation; keep existing mutation pending patterns intact.

## Decisions

| Question             | Decision                                 |
| -------------------- | ---------------------------------------- |
| Visual approach      | Accent rail                              |
| Archived default     | Collapsed                                |
| Persist expand state | No (session component state only)        |
| Redundant badges     | Remove inside Active / Archived sections |
| Scope                | UI only in category detail panel         |
