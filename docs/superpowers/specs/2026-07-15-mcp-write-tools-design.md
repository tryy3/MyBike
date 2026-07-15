# MCP Write Tools (Components & EOL Replace)

**Date:** 2026-07-15  
**Status:** Approved (brainstorming)  
**Builds on:** Existing read-only MCP at `/mcp`, GraphQL component/maintenance mutations, `2026-07-14-maintenance-module-design.md`

## Summary

Expand the MyBike MCP server so an LLM can complete flows such as: _“Create a cassette with model XXXX for my hybrid bike, then replace the current one.”_ Tools are typed MCP handlers that call existing services (same pattern as today’s read tools). Writes require a write-scoped API key. Destructive delete operations stay off MCP.

## Goals

- Let models resolve bikes by name (`find_bike`)
- Create components and edit a limited set of fields
- Switch the active component among existing parts (chain rotation / waxing)
- Log EOL replacement via the maintenance replace flow (service record + optional activate)
- List maintenance tasks so models can find EOL tasks before replace
- Log MCP auth and tool calls in server logs for auditability
- Keep `graphql_query` read-only; do not open a general mutation escape hatch

## Non-goals

- Delete tools (`delete_component`, `delete_bike`, `delete_maintenance_task`)
- Bike create/update/delete via MCP
- Maintenance task CRUD, snooze, touch-up toggles, `complete_maintenance_task`, or `resetMaintenanceTaskToDefault`
- Compound “create + replace” in one tool (two-step only, matching UI)
- Allowing `graphql_query` to run mutations
- Hard-blocking EOL replace when the task is not yet due/soon (UI allows early replace; tool descriptions guide preference)

## Approach

**Typed MCP tools → services** (not GraphQL round-trips, not a mutate allowlist).

- Register tools under `server/src/mcp/tools/`
- Validate inputs with Zod
- Enforce `requireReadPermission` / `requireWritePermission`
- Call `services/bikes`, `services/components`, `services/maintenance`
- Reuse existing service validation and ownership checks

## Auth & permissions

| Capability                                                                          | Required GraphQL action on API key |
| ----------------------------------------------------------------------------------- | ---------------------------------- |
| Existing read tools + `find_bike` + `list_maintenance_tasks`                        | `read`                             |
| `create_component`, `update_component`, `set_active_component`, `replace_component` | `write`                            |

- Add `requireWritePermission` in `server/src/mcp/context.ts` (mirror `requireReadPermission`, require `graphql` includes `"write"`).
- Keys with only `read` must receive a clear 403-style tool error on write tools.
- MCP continues to ignore session cookies; API key only (`Authorization: Bearer` or `x-api-key`).

## Tool contracts

### `find_bike` (read)

**Purpose:** Resolve “my hybrid bike” to an id.

**Input:**

- `nameContains` (required string, min 1)
- `brandContains` (optional)
- `modelContains` (optional)
- `fields` (optional, same allowlist as `list_bikes`)

**Behavior:** Load user’s bikes via `listBikes`, filter case-insensitive substring on name (and brand/model when provided). Return matches (possibly empty or multiple). Do not invent an id when ambiguous or empty.

### `list_maintenance_tasks` (read)

**Purpose:** Discover EOL (and other) tasks before replace.

**Input:**

- `bikeId` (required)
- `category` (optional component category)
- `kind` (optional: `touch_up` | `periodic` | `eol`)
- `enabledOnly` (optional, default `true`)
- `fields` (optional)

**Output:** Task views including at least `id`, `kind`, `title`, `componentCategory`, `status` (`ok` | `due` | `overdue` | `snoozed`), `progress`, `enabled`, `templateKey`. Progress allows clients/models to infer “due soon” (UI uses ratio ≥ 0.75 while status may still be `ok`).

### `create_component` (write)

**Input:**

- `bikeId`, `category`, `name`, `brand`, `model` (required; same rules as `componentInsertSchema`)
- Optional: `notes`, `purchaseDate`, `purchaseCost`, `purchaseStore`

**Behavior:**

- Call `createComponent` with **`isActive: false` always**. Do not expose `isActive` on this tool.
- Activation only via `set_active_component` or `replace_component`.

**Output:** Created component including `id`.

### `update_component` (write)

**Input:**

- `componentId` (required)
- Any of: `brand`, `model`, `purchaseDate`, `purchaseCost`, `purchaseStore`, `notes`

**Explicitly not allowed via MCP:**

- `name` (UI-only rename for auditability if a model creates a bad name)
- `distanceMeters` / `movingTimeMinutes` (wear)
- `category` / `isActive`

Validate with a MCP-specific pick of `componentUpdateSchema` fields (or equivalent Zod object), then call `updateComponent`.

### `set_active_component` (write)

**Purpose:** Rotate among existing components (e.g. multiple waxed chains).

**Input:** `componentId`

**Behavior:** Call `activateComponent`. Tool description must state this does **not** create a service record; use `replace_component` for EOL logging.

### `replace_component` (write)

**Purpose:** EOL replace — log replacement and optionally activate a new part.

**Input:**

- Target task: either `taskId` **or** (`bikeId` + `category`)
- `newComponentId` (required UUID)
- Optional: `notes`, `cost`, `resetWear` (default **`true`**)

**Behavior:**

1. If `taskId` omitted, find enabled EOL tasks for that bike + category via maintenance list helpers. Error if zero or more than one match.
2. Ensure task is `kind === "eol"` and enabled (service already enforces).
3. Ensure `newComponentId` belongs to the user, same bike, and matching `componentCategory`.
4. Call `replaceComponentMaintenance` with `newComponentId`, notes, cost, `resetWear`.

**Guidance (description only, not a hard gate):** Prefer when status is `due`/`overdue` or progress is “soon”; early replace remains allowed (same as UI).

**Output:** Service record from replace (and active component after swap when `newComponentId` is set).

## Example flows

### New cassette (EOL)

1. `find_bike({ nameContains: "hybrid" })` → `bikeId`
2. `create_component({ bikeId, category: "cassette", name, brand, model })` → `newComponentId`
3. `replace_component({ bikeId, category: "cassette", newComponentId })`  
   (or `list_maintenance_tasks` then `replace_component({ taskId, newComponentId })`)

### Chain rotation (not EOL)

1. `find_bike` / `get_bike_components`
2. `set_active_component({ componentId })`

## Logging

Use the existing server logger (`server/src/lib/logging`, service `mybike-server`).

1. **Auth failures** in MCP mount middleware: `warn` for missing/invalid API key (never log the raw key).
2. **Transport/handler failures** in `mount.ts`: log `error` (today’s catch swallows without logging).
3. **Every tool invocation:** `info` with `event: "mcp.tool"`, `userId`, `tool`, `outcome` (`ok` | `error`), duration, and a **safe arg summary** (ids, category, nameContains, etc.). Truncate long free-text (`notes`); do not dump full note bodies when large.
4. **Write tools:** include key result ids in the success log (`componentId`, `taskId`, `serviceRecordId` when applicable).

Prefer a small helper (e.g. `withMcpToolLog`) so all tools share the same shape.

## Schema catalog & docs

- Extend `schema-catalog.ts` / `describe_data_model` notes with write-tool overview and the create → replace vs set_active distinction.
- Update `AGENTS.md` MCP section: list new tools, require write-scoped keys for mutations, note logging.

## Testing

Extend `server/src/test/mcp.test.ts`:

- `tools/list` includes new tool names
- Write tools reject read-only API keys
- Write tools succeed with write-scoped keys
- `find_bike` matches by name substring; empty when no match
- `create_component` creates inactive component
- `update_component` accepts brand/model/purchase/notes and rejects or omits `name`
- `set_active_component` activates target and deactivates sibling
- `replace_component` via bikeId+category with prior create; creates service record
- Cross-user isolation on write tools
- Optional: assert logger calls if the suite already stubs logging; otherwise rely on integration behavior tests

## Files to touch (expected)

| Area           | Path                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth helper    | `server/src/mcp/context.ts`                                                                                                                                       |
| Logging helper | `server/src/mcp/` (e.g. `tool-log.ts`)                                                                                                                            |
| Mount logging  | `server/src/mcp/mount.ts`                                                                                                                                         |
| Registration   | `server/src/mcp/index.ts`                                                                                                                                         |
| New tools      | `server/src/mcp/tools/find-bike.ts`, `list-maintenance-tasks.ts`, `create-component.ts`, `update-component.ts`, `set-active-component.ts`, `replace-component.ts` |
| Catalog        | `server/src/mcp/schema-catalog.ts`                                                                                                                                |
| Tests          | `server/src/test/mcp.test.ts`                                                                                                                                     |
| Docs           | `AGENTS.md`                                                                                                                                                       |

## Out of scope reminders

No delete MCP tools; no `complete_maintenance_task` in this batch; no compound create+replace; LLM workflow skills (Hermes/Cursor) can be added later outside this server change.
