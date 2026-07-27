# Component Archive Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `isArchived` on components with archive/unarchive APIs, optional EOL `archiveOld`, UI sections/actions, and MCP `archive_component` (no MCP unarchive/delete).

**Architecture:** Boolean column + service invariants on top of existing `isActive`. GraphQL mutations wrap services; MCP calls services directly. EOL replace captures previous active id before activation, then archives when `archiveOld` is true.

**Spec:** `docs/superpowers/specs/2026-07-26-component-archive-design.md`

**Tech Stack:** Drizzle/Turso, Zod shared schemas, Pothos GraphQL, MCP tools, React client (TanStack Query).

## File map

| File                                        | Responsibility                     |
| ------------------------------------------- | ---------------------------------- |
| `server/src/db/schema.ts`                   | `isArchived` column                |
| `server/drizzle/*`                          | Generated migration                |
| `shared/src/schemas/component.ts`           | Schema + types                     |
| `shared/src/schemas/component-filter.ts`    | Optional `isArchived` filter       |
| `shared/src/schemas/maintenance.ts`         | `archiveOld` on replace input      |
| `server/src/services/components.ts`         | archive/unarchive + activate guard |
| `server/src/services/maintenance.ts`        | archive previous on replace        |
| `server/src/services/bikes.ts`              | Apply `isArchived` filter          |
| `server/src/graphql/schema/bike.ts`         | Field + mutations                  |
| `server/src/graphql/schema/maintenance.ts`  | Input field                        |
| `server/src/mcp/tools/archive-component.ts` | New tool                           |
| `server/src/mcp/tools/replace-component.ts` | `archiveOld`                       |
| `server/src/mcp/serialize.ts`               | Include `isArchived`               |
| `server/src/mcp/schema-catalog.ts`          | Docs notes                         |
| `server/src/mcp/index.ts`                   | Register tool                      |
| `client/src/lib/graphql/operations.ts`      | Fields + mutations                 |
| `client/src/features/components/*`          | UI sections/actions                |
| `client/src/features/maintenance/*`         | EOL checkbox                       |
| `server/src/test/*.ts`                      | GraphQL + MCP + maintenance tests  |
| `AGENTS.md`                                 | MCP tool list                      |

---

### Task 1: Shared schemas + DB column + migration

**Files:**

- Modify: `server/src/db/schema.ts`, `shared/src/schemas/component.ts`, `shared/src/schemas/component-filter.ts`, `shared/src/schemas/maintenance.ts`
- Generate: drizzle migration

- [ ] Add `isArchived` boolean column default false on `components`
- [ ] Add `isArchived` to `componentSchema` (and any serialization types); keep insert default false; do not add to general `componentUpdateSchema`
- [ ] Add optional `isArchived` to `componentFilterSchema`
- [ ] Add optional `archiveOld` to `replaceMaintenanceInputSchema`
- [ ] `npm run -w shared build` then `npm run -w server db:generate` and `db:migrate`

---

### Task 2: Component services + filters

**Files:**

- Modify: `server/src/services/components.ts`, `server/src/services/bikes.ts`

- [ ] `archiveComponent` / `unarchiveComponent`
- [ ] Guard `activateComponent` when archived
- [ ] Apply filter `isArchived` in bike component listing (same pattern as `isActive`)

---

### Task 3: EOL replace archiveOld

**Files:**

- Modify: `server/src/services/maintenance.ts`

- [ ] Before activate, load previous active for bike+category
- [ ] After activate (+ optional wear reset), if `archiveOld` and previous exists and previous.id !== newComponentId, call `archiveComponent`
- [ ] When no `newComponentId`, ignore `archiveOld`

---

### Task 4: GraphQL

**Files:**

- Modify: `server/src/graphql/schema/bike.ts`, `server/src/graphql/schema/maintenance.ts`

- [ ] Expose `isArchived` on Component
- [ ] Mutations `archiveComponent`, `unarchiveComponent`
- [ ] `ReplaceMaintenanceInput.archiveOld`
- [ ] Filter input `isArchived` if ComponentFilter is defined in GraphQL

---

### Task 5: MCP

**Files:**

- Create: `server/src/mcp/tools/archive-component.ts`
- Modify: `replace-component.ts`, `serialize.ts`, `schema-catalog.ts`, `index.ts`, `AGENTS.md`

- [ ] Register `archive_component`
- [ ] Pass `archiveOld` from `replace_component`
- [ ] Serialize `isArchived`; update catalog notes

---

### Task 6: Client UI

**Files:**

- Modify: `client/src/lib/graphql/operations.ts`, `client/src/features/components/api.ts`, `CategoryDetailContent.tsx`, `MaintenanceTab.tsx`, `features/maintenance/api.ts`

- [ ] Query/mutation fields for `isArchived`, archive/unarchive, replace `archiveOld`
- [ ] Three sections + archive/unarchive actions + muted archived styling
- [ ] EOL checkbox; exclude archived from swap candidates

---

### Task 7: Tests + verify

- [ ] GraphQL/service tests for archive invariants and replace `archiveOld`
- [ ] MCP tests for `archive_component` + replace with `archiveOld`
- [ ] `npm run verify` (or `vp check` + targeted tests)
- [ ] Commit, push, open PR

## Verification commands

```bash
npm run -w shared build
npm run -w server db:migrate
npm run -w server test -- src/test/graphql.test.ts src/test/maintenance.test.ts src/test/mcp.test.ts
npm run verify
```
