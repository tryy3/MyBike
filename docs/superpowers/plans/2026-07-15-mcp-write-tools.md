# MCP Write Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed MCP tools for bike name lookup, maintenance task listing, component create/update, set-active, and EOL replace, with write-scope checks and server-side MCP request logging.

**Architecture:** Follow existing MCP read tools: Zod `inputSchema`, call `services/*` directly, return `content` + `structuredContent`. Add `requireWritePermission` and a shared `withMcpToolLog` wrapper. Do not open `graphql_query` to mutations.

**Spec:** `docs/superpowers/specs/2026-07-15-mcp-write-tools-design.md`

**Tech Stack:** Express MCP (`@modelcontextprotocol/server`), Zod, shared schemas (`permissionsForScope`, `CATEGORY_IDS`, `componentInsertSchema`), Vite+ tests (`vite-plus/test` + supertest), Pino via `server/src/lib/logging`.

## Global Constraints

- Typed tools call services; no GraphQL mutation proxy.
- Write tools require API key scope `permissionsForScope("write")` (`graphql: ["read","write"]`).
- `create_component` always passes `isActive: false` (service still forces active when it is the first component in that category).
- `update_component` may change only brand, model, purchaseDate, purchaseCost, purchaseStore, notes — never `name`.
- No delete tools; `graphql_query` stays query-only.
- Category ids on MCP tools are hyphenated (`cassette`, `rear-derailleur`).
- Run server tests via `nix develop` if host `node`/`vp` is broken: `nix develop -c npm run -w server test -- src/test/mcp.test.ts`.

---

## File map

| File                                             | Responsibility                           |
| ------------------------------------------------ | ---------------------------------------- |
| `server/src/mcp/context.ts`                      | Add `requireWritePermission`             |
| `server/src/mcp/tool-log.ts`                     | `summarizeMcpArgs`, `withMcpToolLog`     |
| `server/src/mcp/mount.ts`                        | Auth + transport error logging           |
| `server/src/mcp/tools/find-bike.ts`              | Name/brand/model substring bike lookup   |
| `server/src/mcp/tools/list-maintenance-tasks.ts` | Filtered maintenance task list           |
| `server/src/mcp/tools/create-component.ts`       | Create inactive component                |
| `server/src/mcp/tools/update-component.ts`       | Limited field update (strict, no name)   |
| `server/src/mcp/tools/set-active-component.ts`   | `activateComponent` wrapper              |
| `server/src/mcp/tools/replace-component.ts`      | EOL replace by taskId or bikeId+category |
| `server/src/mcp/index.ts`                        | Register new tools                       |
| `server/src/mcp/schema-catalog.ts`               | Maintenance fields + write-flow notes    |
| `server/src/test/mcp.test.ts`                    | Coverage for new tools + scopes          |
| `AGENTS.md`                                      | Document write tools + write keys        |

---

### Task 1: Write permission + MCP logging helpers

**Files:**

- Modify: `server/src/mcp/context.ts`
- Create: `server/src/mcp/tool-log.ts`
- Modify: `server/src/mcp/mount.ts`
- Test: `server/src/test/mcp.test.ts` (auth warn path already covered by 401 tests; tool-log covered when first tool uses it in Task 2)

**Interfaces:**

- Produces: `requireWritePermission(auth: McpAuthContext): string`
- Produces: `withMcpToolLog<TArgs, TResult>(tool: string, auth: McpAuthContext, args: TArgs, fn: () => Promise<TResult>): Promise<TResult>`
- Produces: `summarizeMcpArgs(args: unknown): Record<string, unknown>`

- [ ] **Step 1: Add `requireWritePermission`**

In `server/src/mcp/context.ts`, next to `requireReadPermission`:

```typescript
export function requireWritePermission(auth: McpAuthContext): string {
  const actions = auth.permissions?.graphql ?? [];
  if (!actions.includes("write")) {
    throw new HttpError(403, "API key lacks required permission");
  }
  return auth.userId;
}
```

- [ ] **Step 2: Create `tool-log.ts`**

```typescript
import { logger } from "../lib/logging/index.js";
import type { McpAuthContext } from "./context.js";

const LONG_STRING = 200;

export function summarizeMcpArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === "string" && value.length > LONG_STRING) {
      out[key] = `${value.slice(0, LONG_STRING)}…`;
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export async function withMcpToolLog<TArgs, TResult>(
  tool: string,
  auth: McpAuthContext,
  args: TArgs,
  fn: () => Promise<TResult>,
): Promise<TResult> {
  const started = Date.now();
  try {
    const result = await fn();
    logger.info(
      {
        event: "mcp.tool",
        userId: auth.userId,
        tool,
        outcome: "ok",
        durationMs: Date.now() - started,
        args: summarizeMcpArgs(args),
      },
      `MCP tool ${tool} ok`,
    );
    return result;
  } catch (err) {
    logger.info(
      {
        event: "mcp.tool",
        userId: auth.userId,
        tool,
        outcome: "error",
        durationMs: Date.now() - started,
        args: summarizeMcpArgs(args),
        err,
      },
      `MCP tool ${tool} error`,
    );
    throw err;
  }
}
```

- [ ] **Step 3: Log auth failures and transport errors in `mount.ts`**

Import `logger` from `../lib/logging/index.js`.

In `mcpAuthMiddleware`, before each `unauthorizedResponse`:

```typescript
logger.warn({ event: "mcp.auth", reason: "missing_key" }, "MCP unauthorized");
// and for invalid:
logger.warn({ event: "mcp.auth", reason: "invalid_key" }, "MCP unauthorized");
```

Replace the empty `.catch(() => {` body start with:

```typescript
})().catch((err) => {
  logger.error({ event: "mcp.transport", err }, "MCP request failed");
  if (!res.headersSent) {
    // existing 500 jsonrpc response
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add server/src/mcp/context.ts server/src/mcp/tool-log.ts server/src/mcp/mount.ts
git commit -m "feat(mcp): add write permission check and request logging"
```

---

### Task 2: `find_bike`

**Files:**

- Create: `server/src/mcp/tools/find-bike.ts`
- Modify: `server/src/mcp/index.ts` (register)
- Modify: `server/src/test/mcp.test.ts`

**Interfaces:**

- Consumes: `listBikes`, `requireReadPermission`, `withMcpToolLog`, bike field pickers from `schema-catalog` / `serialize`
- Produces: tool name `find_bike`

- [ ] **Step 1: Write failing tests in `mcp.test.ts`**

Import `permissionsForScope` from `shared`. Extend the `tools/list` expectation to eventually include new names (add `find_bike` now; other names in later tasks).

```typescript
it("find_bike matches name substring", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  const readKey = await createApiKeyForTestUser(testUser);
  const bike = await createBikeViaGraphql(agent, "City Hybrid");

  const res = await mcpRequest(readKey, {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "find_bike", arguments: { nameContains: "hybrid" } },
  });

  expect(res.status).toBe(200);
  const bikes = (
    jsonRpcResult(res.body)?.structuredContent as { bikes: { id: string; name: string }[] }
  )?.bikes;
  expect(bikes?.some((b) => b.id === bike.id && b.name === "City Hybrid")).toBe(true);

  const none = await mcpRequest(readKey, {
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: { name: "find_bike", arguments: { nameContains: "no-such-bike-zzz" } },
  });
  const empty = (jsonRpcResult(none.body)?.structuredContent as { bikes: unknown[] })?.bikes;
  expect(empty).toEqual([]);
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
nix develop -c npm run -w server test -- src/test/mcp.test.ts -t "find_bike"
```

Expected: fail (tool missing / not registered).

- [ ] **Step 3: Implement `find-bike.ts` and register**

```typescript
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listBikes } from "../../services/bikes.js";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { pickFieldsList } from "../field-selection.js";
import { assertAllowedFields, BIKE_FIELDS, DEFAULT_BIKE_FIELDS } from "../schema-catalog.js";
import { withRideStatsIfNeeded } from "../serialize.js";
import { withMcpToolLog } from "../tool-log.js";

function includesCI(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function registerFindBikeTool(server: McpServer): void {
  server.registerTool(
    "find_bike",
    {
      title: "Find bike",
      description:
        "Find bikes by case-insensitive name substring (optional brand/model). Returns matches; empty if none. Use list_bikes if you need the full garage.",
      inputSchema: z.object({
        nameContains: z.string().trim().min(1),
        brandContains: z.string().trim().min(1).optional(),
        modelContains: z.string().trim().min(1).optional(),
        fields: z.array(z.string()).optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("find_bike", auth, args, async () => {
        const userId = requireReadPermission(auth);
        const fields = assertAllowedFields(args.fields, BIKE_FIELDS, "bike");
        const effectiveFields =
          args.fields && args.fields.length > 0 ? fields : [...DEFAULT_BIKE_FIELDS];

        const bikes = (await listBikes(userId)).filter((bike) => {
          if (!includesCI(bike.name, args.nameContains)) return false;
          if (args.brandContains && !includesCI(bike.brand, args.brandContains)) return false;
          if (args.modelContains && !includesCI(bike.model, args.modelContains)) return false;
          return true;
        });

        const serialized = await Promise.all(
          bikes.map((bike) => withRideStatsIfNeeded(userId, bike, effectiveFields)),
        );
        const result = pickFieldsList(serialized, effectiveFields);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: { bikes: result },
        };
      });
    },
  );
}
```

In `index.ts`: `registerFindBikeTool(server);`

- [ ] **Step 4: Run test — expect pass**

```bash
nix develop -c npm run -w server test -- src/test/mcp.test.ts -t "find_bike"
```

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/tools/find-bike.ts server/src/mcp/index.ts server/src/test/mcp.test.ts
git commit -m "feat(mcp): add find_bike tool"
```

---

### Task 3: `list_maintenance_tasks`

**Files:**

- Create: `server/src/mcp/tools/list-maintenance-tasks.ts`
- Modify: `server/src/mcp/schema-catalog.ts` (add `MAINTENANCE_TASK_FIELDS`, defaults, catalog notes)
- Modify: `server/src/mcp/index.ts`
- Modify: `server/src/test/mcp.test.ts`

**Interfaces:**

- Consumes: `listMaintenanceTasksForBike` from `services/maintenance.ts`
- Produces: tool `list_maintenance_tasks`

- [ ] **Step 1: Write failing test**

```typescript
it("list_maintenance_tasks returns seeded EOL tasks", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  const readKey = await createApiKeyForTestUser(testUser);
  const bike = await createBikeViaGraphql(agent, "Maint Bike");

  const res = await mcpRequest(readKey, {
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: {
      name: "list_maintenance_tasks",
      arguments: { bikeId: bike.id, kind: "eol", category: "cassette" },
    },
  });

  expect(res.status).toBe(200);
  const tasks = (
    jsonRpcResult(res.body)?.structuredContent as {
      tasks: { kind: string; componentCategory: string | null; templateKey: string | null }[];
    }
  )?.tasks;
  expect(tasks?.length).toBeGreaterThanOrEqual(1);
  expect(tasks!.every((t) => t.kind === "eol" && t.componentCategory === "cassette")).toBe(true);
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
nix develop -c npm run -w server test -- src/test/mcp.test.ts -t "list_maintenance_tasks"
```

- [ ] **Step 3: Add catalog fields + implement tool**

In `schema-catalog.ts` add:

```typescript
export const MAINTENANCE_TASK_FIELDS = [
  "id",
  "bikeId",
  "source",
  "templateKey",
  "kind",
  "title",
  "description",
  "componentCategory",
  "triggerMode",
  "distanceMeters",
  "intervalDays",
  "guideUrl",
  "enabled",
  "customized",
  "sortOrder",
  "status",
  "progress",
  "lastCheckedAt",
  "canDelete",
  "createdAt",
  "updatedAt",
] as const;

export const DEFAULT_MAINTENANCE_TASK_FIELDS = [
  "id",
  "kind",
  "title",
  "componentCategory",
  "status",
  "progress",
  "enabled",
  "templateKey",
] as const;
```

Include `maintenanceTaskFields` / `defaultMaintenanceTaskFields` in `getSchemaCatalog()`. Leave full write-tool workflow notes for Task 8.

Tool implementation sketch:

```typescript
// filter after listMaintenanceTasksForBike(bikeId, userId)
let tasks = await listMaintenanceTasksForBike(args.bikeId, userId);
if (args.enabledOnly !== false) tasks = tasks.filter((t) => t.enabled);
if (args.kind) tasks = tasks.filter((t) => t.kind === args.kind);
if (args.category) tasks = tasks.filter((t) => t.componentCategory === args.category);
// pickFieldsList on plain objects (tasks are already JSON-serializable views)
```

Input schema:

```typescript
z.object({
  bikeId: z.string().min(1),
  category: z.enum(CATEGORY_IDS).optional(),
  kind: z.enum(["touch_up", "periodic", "eol"]).optional(),
  enabledOnly: z.boolean().optional(),
  fields: z.array(z.string()).optional(),
});
```

Wrap with `withMcpToolLog` + `requireReadPermission`. Register in `index.ts`.

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/tools/list-maintenance-tasks.ts server/src/mcp/schema-catalog.ts server/src/mcp/index.ts server/src/test/mcp.test.ts
git commit -m "feat(mcp): add list_maintenance_tasks tool"
```

---

### Task 4: `create_component`

**Files:**

- Create: `server/src/mcp/tools/create-component.ts`
- Modify: `server/src/mcp/index.ts`
- Modify: `server/src/test/mcp.test.ts`

**Interfaces:**

- Consumes: `createComponent` from `services/components.ts`, `componentInsertSchema` / `CATEGORY_IDS`, `requireWritePermission`, `serializeComponent`
- Produces: tool `create_component`

- [ ] **Step 1: Write failing tests**

```typescript
it("create_component requires write scope and creates inactive when sibling exists", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  const readKey = await createApiKeyForTestUser(testUser);
  const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
  const bike = await createBikeViaGraphql(agent, "Create Comp Bike");
  await createComponentViaGraphql(agent, bike.id, {
    category: "cassette",
    name: "Old Cassette",
    brand: "Shimano",
    model: "CS-Old",
    isActive: true,
  });

  const denied = await mcpRequest(readKey, {
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: {
      name: "create_component",
      arguments: {
        bikeId: bike.id,
        category: "cassette",
        name: "New Cassette",
        brand: "SRAM",
        model: "XG-1270",
      },
    },
  });
  expect(jsonRpcResult(denied.body)?.isError).toBe(true);

  const ok = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 31,
    method: "tools/call",
    params: {
      name: "create_component",
      arguments: {
        bikeId: bike.id,
        category: "cassette",
        name: "New Cassette",
        brand: "SRAM",
        model: "XG-1270",
      },
    },
  });
  expect(ok.status).toBe(200);
  const component = (
    jsonRpcResult(ok.body)?.structuredContent as { component: { isActive: boolean; model: string } }
  )?.component;
  expect(component?.model).toBe("XG-1270");
  expect(component?.isActive).toBe(false);
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement tool**

```typescript
// input: bikeId + category + name + brand + model + optional notes/purchase*
// Parse with componentInsertSchema.omit({ isActive: true }) then force isActive: false
const parsed = componentInsertSchema.parse({ ...argsWithoutBikeId, isActive: false });
const row = await createComponent(args.bikeId, userId, parsed);
const component = await serializeComponent(row);
// structuredContent: { component }
// description: "Creates a component. Always inactive when another exists in the category; use set_active_component or replace_component to activate. First component in a category is forced active by the server."
```

Use `requireWritePermission` inside `withMcpToolLog`.

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/tools/create-component.ts server/src/mcp/index.ts server/src/test/mcp.test.ts
git commit -m "feat(mcp): add create_component tool"
```

---

### Task 5: `update_component`

**Files:**

- Create: `server/src/mcp/tools/update-component.ts`
- Modify: `server/src/mcp/index.ts`
- Modify: `server/src/test/mcp.test.ts`

**Interfaces:**

- Consumes: `updateComponent`, `requireWritePermission`
- Produces: tool `update_component`

- [ ] **Step 1: Write failing tests**

```typescript
it("update_component updates brand/model and rejects name", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
  const bike = await createBikeViaGraphql(agent, "Update Comp Bike");
  const created = await createComponentViaGraphql(agent, bike.id, {
    category: "chain",
    name: "Keep This Name",
    brand: "OldBrand",
    model: "OldModel",
    isActive: true,
  });

  const ok = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 40,
    method: "tools/call",
    params: {
      name: "update_component",
      arguments: { componentId: created.id, brand: "NewBrand", model: "NewModel" },
    },
  });
  const component = (
    jsonRpcResult(ok.body)?.structuredContent as {
      component: { name: string; brand: string; model: string };
    }
  )?.component;
  expect(component).toMatchObject({
    name: "Keep This Name",
    brand: "NewBrand",
    model: "NewModel",
  });

  const rejected = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 41,
    method: "tools/call",
    params: {
      name: "update_component",
      arguments: { componentId: created.id, name: "Hacked" },
    },
  });
  expect(jsonRpcResult(rejected.body)?.isError).toBe(true);
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement with `.strict()` schema (no `name`)**

```typescript
const mcpComponentUpdateSchema = z
  .object({
    componentId: z.string().uuid(),
    brand: z.string().trim().min(1).max(200).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(5000).nullish(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    purchaseCost: z.number().min(0).nullish(),
    purchaseStore: z.string().max(200).nullish(),
  })
  .strict();

// Pass remaining fields through componentUpdateSchema.parse after omitting componentId
```

`.strict()` makes unknown `name` fail validation → MCP `isError`.

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/tools/update-component.ts server/src/mcp/index.ts server/src/test/mcp.test.ts
git commit -m "feat(mcp): add update_component tool without name"
```

---

### Task 6: `set_active_component`

**Files:**

- Create: `server/src/mcp/tools/set-active-component.ts`
- Modify: `server/src/mcp/index.ts`
- Modify: `server/src/test/mcp.test.ts`

**Interfaces:**

- Consumes: `activateComponent`
- Produces: tool `set_active_component`

- [ ] **Step 1: Write failing test**

```typescript
it("set_active_component rotates active chain", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
  const bike = await createBikeViaGraphql(agent, "Swap Chain Bike");
  const a = await createComponentViaGraphql(agent, bike.id, {
    category: "chain",
    name: "Chain A",
    brand: "KMC",
    model: "A",
    isActive: true,
  });
  const b = await createComponentViaGraphql(agent, bike.id, {
    category: "chain",
    name: "Chain B",
    brand: "KMC",
    model: "B",
    isActive: false,
  });

  const res = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 50,
    method: "tools/call",
    params: { name: "set_active_component", arguments: { componentId: b.id } },
  });
  const component = (
    jsonRpcResult(res.body)?.structuredContent as { component: { id: string; isActive: boolean } }
  )?.component;
  expect(component).toMatchObject({ id: b.id, isActive: true });

  // verify via get_bike_components activeOnly
  const list = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 51,
    method: "tools/call",
    params: {
      name: "get_bike_components",
      arguments: { bikeId: bike.id, activeOnly: true, filter: { categories: ["chain"] } },
    },
  });
  const active = (jsonRpcResult(list.body)?.structuredContent as { components: { id: string }[] })
    ?.components;
  expect(active?.map((c) => c.id)).toEqual([b.id]);
  expect(a.id).not.toBe(b.id);
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement**

```typescript
// description: "Activate an existing component (deactivates siblings in the same bike+category). Use for rotating spare parts (e.g. waxed chains). Does not create a service record — use replace_component for EOL replacement."
// input: { componentId: z.string().uuid() }
// activateComponent(componentId, userId) + serializeComponent
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/tools/set-active-component.ts server/src/mcp/index.ts server/src/test/mcp.test.ts
git commit -m "feat(mcp): add set_active_component tool"
```

---

### Task 7: `replace_component`

**Files:**

- Create: `server/src/mcp/tools/replace-component.ts`
- Modify: `server/src/mcp/index.ts`
- Modify: `server/src/test/mcp.test.ts`

**Interfaces:**

- Consumes: `listMaintenanceTasksForBike`, `replaceComponentMaintenance`, `HttpError` / `badRequest` for 0/multiple EOL matches
- Produces: tool `replace_component`

- [ ] **Step 1: Write failing test (create → replace flow)**

```typescript
it("replace_component logs EOL replace and activates new cassette", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
  const bike = await createBikeViaGraphql(agent, "EOL Replace Bike");
  await createComponentViaGraphql(agent, bike.id, {
    category: "cassette",
    name: "Worn Cassette",
    brand: "Shimano",
    model: "Old",
    isActive: true,
  });

  const created = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 60,
    method: "tools/call",
    params: {
      name: "create_component",
      arguments: {
        bikeId: bike.id,
        category: "cassette",
        name: "Fresh Cassette",
        brand: "SRAM",
        model: "XXXX",
      },
    },
  });
  const newId = (jsonRpcResult(created.body)?.structuredContent as { component: { id: string } })
    ?.component.id;

  const replaced = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 61,
    method: "tools/call",
    params: {
      name: "replace_component",
      arguments: {
        bikeId: bike.id,
        category: "cassette",
        newComponentId: newId,
        resetWear: true,
      },
    },
  });
  expect(replaced.status).toBe(200);
  const record = (
    jsonRpcResult(replaced.body)?.structuredContent as {
      serviceRecord: { action: string; componentId: string | null };
    }
  )?.serviceRecord;
  expect(record?.action).toBe("replaced");

  const list = await mcpRequest(writeKey, {
    jsonrpc: "2.0",
    id: 62,
    method: "tools/call",
    params: {
      name: "get_bike_components",
      arguments: { bikeId: bike.id, activeOnly: true, filter: { categories: ["cassette"] } },
    },
  });
  const active = (jsonRpcResult(list.body)?.structuredContent as { components: { id: string }[] })
    ?.components;
  expect(active?.[0]?.id).toBe(newId);
});
```

Also add a short test that read key is denied on `replace_component`.

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement resolution + replace**

```typescript
const inputSchema = z
  .object({
    taskId: z.string().uuid().optional(),
    bikeId: z.string().uuid().optional(),
    category: z.enum(CATEGORY_IDS).optional(),
    newComponentId: z.string().uuid(),
    notes: z.string().max(5000).nullish(),
    cost: z.number().min(0).nullish(),
    resetWear: z.boolean().optional(), // default true when calling service
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasTask = data.taskId != null;
    const hasBikeCat = data.bikeId != null && data.category != null;
    if (hasTask === hasBikeCat) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either taskId, or both bikeId and category",
      });
    }
  });

// Resolve taskId:
// if taskId use it
// else listMaintenanceTasksForBike → filter enabled && kind==="eol" && componentCategory===category
// if length !== 1 throw badRequest with clear message

const record = await replaceComponentMaintenance(taskId, userId, {
  newComponentId: data.newComponentId,
  notes: data.notes,
  cost: data.cost,
  resetWear: data.resetWear ?? true,
});
// structuredContent: { serviceRecord: record }
```

Description must say: prefer due/overdue/soon; early replace allowed; use after `create_component`; not for spare rotation (`set_active_component`).

Import `badRequest` from `../lib/errors.js` (or `HttpError`).

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/tools/replace-component.ts server/src/mcp/index.ts server/src/test/mcp.test.ts
git commit -m "feat(mcp): add replace_component EOL tool"
```

---

### Task 8: Catalog notes, tools/list assertion, AGENTS.md, verify

**Files:**

- Modify: `server/src/mcp/schema-catalog.ts`
- Modify: `server/src/test/mcp.test.ts` (full tool name list)
- Modify: `AGENTS.md`
- Wrap the six existing read tools (`describe_data_model`, `list_bikes`, `get_bike`, `list_component_categories`, `get_bike_components`, `graphql_query`) with `withMcpToolLog` so all MCP tools share the same audit shape

- [ ] **Step 1: Update `tools/list` expectation**

```typescript
expect(toolNames).toEqual(
  expect.arrayContaining([
    "describe_data_model",
    "list_bikes",
    "get_bike",
    "list_component_categories",
    "get_bike_components",
    "graphql_query",
    "find_bike",
    "list_maintenance_tasks",
    "create_component",
    "update_component",
    "set_active_component",
    "replace_component",
  ]),
);
```

- [ ] **Step 2: Expand `getSchemaCatalog().notes`**

```typescript
notes: {
  typedTools:
    "Use fields[] on list/get tools to request only needed data. Write tools: create_component (inactive when sibling exists), update_component (brand/model/purchase/notes only — not name), set_active_component (rotate spares), replace_component (EOL service record + activate).",
  workflows:
    "EOL replace: find_bike → create_component → replace_component(bikeId+category+newComponentId). Spare rotation: find_bike → get_bike_components → set_active_component.",
  graphqlQuery:
    "Use graphql_query for ad-hoc read queries when typed tools are not enough. Mutations are rejected.",
  categoryIds:
    "Typed tools use hyphenated category ids (rear-derailleur). Raw GraphQL filter enums use underscores (rear_derailleur).",
  filters:
    "Component filters: categories, activeOnly, isActive, brands, nameContains, brandContains, modelContains.",
  auth: "Read tools need graphql:read. Write tools need graphql:write on the API key.",
},
```

- [ ] **Step 3: Update AGENTS.md Remote MCP section**

Replace “Read-only trial tools…” with the full tool list, note write-scoped keys for mutations, and that MCP tool calls are logged server-side (`event: "mcp.tool"`).

- [ ] **Step 4: Run full MCP suite + `vp check` for touched packages**

```bash
nix develop -c npm run -w server test -- src/test/mcp.test.ts
nix develop -c vp check
```

Expected: all MCP tests pass; check clean.

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp/schema-catalog.ts server/src/mcp/tools/*.ts server/src/test/mcp.test.ts AGENTS.md
git commit -m "docs(mcp): document write tools and complete catalog notes"
```

---

## Spec coverage checklist

| Spec requirement                                                        | Task                      |
| ----------------------------------------------------------------------- | ------------------------- |
| `find_bike`                                                             | 2                         |
| `list_maintenance_tasks`                                                | 3                         |
| `create_component` (inactive default)                                   | 4                         |
| `update_component` without name                                         | 5                         |
| `set_active_component`                                                  | 6                         |
| `replace_component` (taskId or bikeId+category, resetWear default true) | 7                         |
| `requireWritePermission` / scopes                                       | 1, 4–7                    |
| MCP logging (auth, transport, all tools)                                | 1 + 8                     |
| Schema catalog + AGENTS.md                                              | 3, 8                      |
| Tests for flows + isolation/scopes                                      | 2–8                       |
| No delete / no graphql mutations                                        | Global — do not implement |

## Self-review notes

- `createComponent` service forces first-in-category active — documented in tool description and Global Constraints.
- `update_component` uses `.strict()` so `name` fails loudly.
- `replace_component` XOR of `taskId` vs `bikeId`+`category` is explicit in Zod `superRefine`.
