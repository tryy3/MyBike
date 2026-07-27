# Component Archive

**Date:** 2026-07-26  
**Status:** Approved (brainstorming)  
**Builds on:** Component active/alternate model, EOL `replaceComponentMaintenance`, MCP write tools (`2026-07-15-mcp-write-tools-design.md`)

## Summary

Add a non-destructive **archive** flag for components so retired parts (especially EOL chains) can leave the active/alternate rotation without being deleted. Delete remains available in the UI for mistakes; archive is the preferred retirement path. MCP can archive (and opt into archive-on-EOL-replace) but cannot unarchive or delete.

## Goals

- Persist `isArchived` on components (boolean, default false)
- Allow archive only when the component is inactive
- Block activate while archived; require explicit unarchive first
- Optional `archiveOld` on EOL replace (default **false**)
- UI shows Active, Alternates, and Archived (simple three-section list)
- UI: archive, unarchive; keep delete
- MCP: `archive_component`; extend `replace_component` with `archiveOld`; no unarchive/delete tools

## Non-goals

- Soft-delete / `archivedAt` timestamps (boolean is enough)
- Hiding archived by default or collapsing cluttered lists (revisit later)
- Auto-archive on spare rotation (`set_active_component` / “Use this”)
- CSV column for `isArchived` in this change (DB default keeps import/export working)
- MCP unarchive or delete

## Model & invariants

| State     | `isActive` | `isArchived` | UI section |
| --------- | ---------- | ------------ | ---------- |
| Active    | true       | false        | Active     |
| Alternate | false      | false        | Alternates |
| Archived  | false      | true         | Archived   |

Invariants (enforced in services):

1. Never `isActive && isArchived`
2. `archiveComponent` requires `!isActive` and `!isArchived`
3. `unarchiveComponent` requires `isArchived`; result is inactive alternate
4. `activateComponent` rejects archived components (clear error)
5. Creating/updating components always leaves `isArchived` false unless archive APIs set it
6. Existing unique partial index on active-per-category unchanged (archived rows are never active)

## Backend

### Schema

- Column: `components.is_archived` integer boolean, `notNull`, default `false`
- Drizzle migration via `db:generate`
- Shared Zod: include `isArchived` on `componentSchema` / GraphQL type; not on insert (always false) or general update patch
- Component filter (optional): `isArchived: boolean` and/or `archivedOnly` — default list behavior remains **return all** (active + alternate + archived)

### Services (`server/src/services/components.ts`)

- `archiveComponent(id, userId)` → set `isArchived: true` if inactive and not already archived
- `unarchiveComponent(id, userId)` → set `isArchived: false` (stays inactive)
- `activateComponent` → if `isArchived`, throw `badRequest` (e.g. code `COMPONENT_ARCHIVED`)
- Create path unchanged (`isArchived` defaults false)

### EOL replace (`replaceComponentMaintenance`)

Extend `replaceMaintenanceInputSchema` with:

```ts
archiveOld: z.boolean().optional(); // default false when omitted
```

When `newComponentId` is set and `archiveOld === true`:

1. Resolve the component that was active in that bike+category **before** activation (or capture its id before `activateComponent`)
2. Activate the new component (existing behavior)
3. Archive the previous active component (must now be inactive)
4. If there was no previous active, or previous === new, skip archive silently (or no-op)

When `newComponentId` is omitted (log-only replace), `archiveOld` is ignored or rejected with a clear error — prefer **ignore** to keep UI checkbox harmless when no swap is selected.

### GraphQL

- Field `Component.isArchived: Boolean!`
- Mutations: `archiveComponent(id)`, `unarchiveComponent(id)` → return updated component
- `ReplaceMaintenanceInput.archiveOld: Boolean` (optional)
- `ComponentFilter.isArchived` optional boolean for reads

## UI

### Components tab (`CategoryDetailContent`)

Three sections when non-empty:

1. **Active** — existing actions (edit, delete); no archive
2. **Alternates** — Use this, Edit, **Archive**, Delete
3. **Archived** — muted row + Archive badge/icon; **Unarchive**, Edit, Delete; no Use this

Keep layout simple; no new filters/toggles in this iteration.

### EOL replace form (`MaintenanceTab` ReplaceForm)

- Checkbox: “Archive previous component” (default unchecked)
- Pass `archiveOld` only when a swap component is selected (or always pass false when none)
- Candidate list: prefer non-archived components for swap (archived stay out of the dropdown, or show as disabled — prefer **exclude archived** from swap candidates)

## MCP

| Tool                                    | Change                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| `archive_component`                     | **New.** Input: `componentId`. Write scope. Calls `archiveComponent`. |
| `replace_component`                     | Optional `archiveOld` (default false). Forward to service.            |
| `set_active_component`                  | No API change; archived targets fail via service error.               |
| `create_component` / `update_component` | Unchanged; serialize `isArchived`.                                    |
| Unarchive / delete                      | **Not** exposed                                                       |

Update `schema-catalog` / `describe_data_model` notes and `AGENTS.md` MCP tool list.

Example EOL flow:

1. `create_component` (new waxed chain)
2. `replace_component({ bikeId, category: "chain", newComponentId, archiveOld: true })`

Example rotation (no archive):

1. `set_active_component({ componentId })`

## Testing

- Service/GraphQL: archive inactive OK; archive active fails; activate archived fails; unarchive restores alternate; replace with `archiveOld: true` archives previous; default replace does not archive
- MCP: `archive_component` write-scope; success on inactive; failure on active; `replace_component` with `archiveOld`
- Client: covered indirectly via GraphQL ops; no mandatory Playwright in this change

## Decisions (brainstorming)

| Question                 | Decision                      |
| ------------------------ | ----------------------------- |
| Activate archived?       | Block; must unarchive first   |
| EOL `archiveOld` default | Off (opt-in)                  |
| MCP unarchive            | UI-only for now               |
| Delete                   | Keep UI/GraphQL; never MCP    |
| UI visibility            | Show all three states for now |
