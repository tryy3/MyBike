# Component Properties (Chain Lube Type) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a category-specific `properties` bag on components, starting with required chain `lubeType`, exposed via GraphQL/MCP/CSV/UI with wet-lube defaults and `lubeTypes` filtering.

**Architecture:** Store `components.properties` as TEXT JSON (`text(..., { mode: "json" })`). Own the contract in `shared/` with per-category Zod helpers that default chain lube to `wet_lube` and reject keys on non-chains. Service + GraphQL + MCP all call those helpers; API always returns an object (`{}` when empty).

**Spec:** `docs/superpowers/specs/2026-07-26-component-properties-design.md`

**Tech Stack:** Zod 4 (`shared`), Drizzle + Turso (`server`), Pothos/Yoga GraphQL, MCP tools, React Hook Form + shadcn Select (`client`), Vite+ tests (`vp test` / `npm run -w shared test` / `npm run -w server test`).

## Global Constraints

- `properties` is always an object in API responses — never `null` (DB `NULL` → `{}`).
- Allowed lube ids (verbatim): `dry_lube`, `wet_lube`, `drip_wax`, `immersion_wax`. Default: `wet_lube`.
- Only category `chain` may have `lubeType`; any other category with non-empty properties → validation error.
- Chain create/update that omits `lubeType` (or omits `properties`) → default `wet_lube`.
- `properties` on update is a full replace of the bag (no deep-merge).
- No Turso STRICT / `json`/`jsonb` custom types; no user-defined custom fields.
- After `shared` schema changes: `npm run -w shared build` before server/client tests.
- Prefer `npm run verify` before considering the branch done.

---

## File map

| File                                                               | Responsibility                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `shared/src/schemas/component-properties.ts`                       | Lube enum, labels, normalize/parse helpers                     |
| `shared/src/schemas/component.ts`                                  | Wire `properties` into insert/update/full schemas + CSV column |
| `shared/src/schemas/component-filter.ts`                           | Add `lubeTypes`                                                |
| `shared/src/index.ts`                                              | Re-export properties module                                    |
| `shared/src/schemas.test.ts`                                       | Zod coverage                                                   |
| `server/src/db/schema.ts`                                          | `properties` column                                            |
| `server/drizzle/20260726120000_component_properties/migration.sql` | ADD COLUMN + chain backfill                                    |
| `server/src/services/components.ts`                                | Persist/normalize on create/update                             |
| `server/src/services/bikes.ts`                                     | `lubeTypes` SQL filter                                         |
| `server/src/services/component-import.ts`                          | CSV `lube_type` map                                            |
| `server/src/graphql/schema/component.ts`                           | `LubeType` enum + `ComponentProperties` + field                |
| `server/src/graphql/schema/bike.ts`                                | Input fields                                                   |
| `server/src/graphql/component-filter.ts`                           | `lubeTypes` on filter input                                    |
| `server/src/mcp/schema-catalog.ts`                                 | Field/filter catalog                                           |
| `server/src/mcp/serialize.ts`                                      | Include normalized `properties`                                |
| `server/src/mcp/tools/create-component.ts`                         | Accept `properties`                                            |
| `server/src/mcp/tools/update-component.ts`                         | Accept `properties`                                            |
| `server/src/test/graphql.test.ts`                                  | Create/update/filter cases                                     |
| `server/src/test/mcp.test.ts`                                      | MCP round-trip                                                 |
| `client/src/lib/graphql/operations.ts`                             | Selection + types                                              |
| `client/src/features/components/ComponentForm.tsx`                 | Chain lube select                                              |
| `client/src/features/components/CategoryDetailContent.tsx`         | Display + chain-only local filter                              |
| `client/src/features/components/csv.ts`                            | Template column if needed                                      |

---

### Task 1: Shared `component-properties` module + unit tests

**Files:**

- Create: `shared/src/schemas/component-properties.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/schemas.test.ts`

**Interfaces:**

- Produces: `LUBE_TYPE_IDS`, `LubeType`, `DEFAULT_LUBE_TYPE`, `LUBE_TYPE_LABELS`
- Produces: `ComponentProperties` (`{ lubeType?: LubeType }` — empty object has no keys)
- Produces: `normalizePropertiesForWrite(category: string, input: unknown): ComponentProperties`
- Produces: `normalizePropertiesForRead(category: string, stored: unknown): ComponentProperties`
- Produces: `lubeTypeSchema` (`z.enum(LUBE_TYPE_IDS)`)

- [ ] **Step 1: Write failing tests**

Append to `shared/src/schemas.test.ts`:

```typescript
import {
  DEFAULT_LUBE_TYPE,
  normalizePropertiesForRead,
  normalizePropertiesForWrite,
} from "./schemas/component-properties.js";

describe("normalizePropertiesForWrite", () => {
  it("defaults chain omit to wet_lube", () => {
    expect(normalizePropertiesForWrite("chain", undefined)).toEqual({
      lubeType: DEFAULT_LUBE_TYPE,
    });
    expect(normalizePropertiesForWrite("chain", {})).toEqual({
      lubeType: "wet_lube",
    });
  });

  it("accepts each lube type on chain", () => {
    for (const lubeType of ["dry_lube", "wet_lube", "drip_wax", "immersion_wax"] as const) {
      expect(normalizePropertiesForWrite("chain", { lubeType })).toEqual({ lubeType });
    }
  });

  it("rejects unknown keys and invalid enum on chain", () => {
    expect(() =>
      normalizePropertiesForWrite("chain", { lubeType: "wet_lube", extra: 1 }),
    ).toThrow();
    expect(() => normalizePropertiesForWrite("chain", { lubeType: "graphite" })).toThrow();
  });

  it("allows empty properties on non-chain and rejects lubeType", () => {
    expect(normalizePropertiesForWrite("frame", undefined)).toEqual({});
    expect(normalizePropertiesForWrite("cassette", {})).toEqual({});
    expect(() => normalizePropertiesForWrite("frame", { lubeType: "wet_lube" })).toThrow();
  });
});

describe("normalizePropertiesForRead", () => {
  it("returns {} for null non-chain and wet_lube for null chain", () => {
    expect(normalizePropertiesForRead("frame", null)).toEqual({});
    expect(normalizePropertiesForRead("chain", null)).toEqual({ lubeType: "wet_lube" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run -w shared test -- src/schemas.test.ts`  
Expected: FAIL — cannot find module `./schemas/component-properties.js`

- [ ] **Step 3: Implement `component-properties.ts`**

```typescript
import { z } from "zod";

export const LUBE_TYPE_IDS = ["dry_lube", "wet_lube", "drip_wax", "immersion_wax"] as const;
export type LubeType = (typeof LUBE_TYPE_IDS)[number];
export const DEFAULT_LUBE_TYPE: LubeType = "wet_lube";

export const LUBE_TYPE_LABELS: Record<LubeType, string> = {
  dry_lube: "Dry lube",
  wet_lube: "Wet lube",
  drip_wax: "Drip wax",
  immersion_wax: "Immersion wax",
};

export const lubeTypeSchema = z.enum(LUBE_TYPE_IDS);

export const chainPropertiesSchema = z
  .object({
    lubeType: lubeTypeSchema,
  })
  .strict();

export const emptyPropertiesSchema = z.object({}).strict();

export type ComponentProperties =
  | z.infer<typeof chainPropertiesSchema>
  | z.infer<typeof emptyPropertiesSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate + default for writes (create/update/CSV/MCP). */
export function normalizePropertiesForWrite(category: string, input: unknown): ComponentProperties {
  if (category === "chain") {
    const base = input === undefined || input === null ? {} : isPlainObject(input) ? input : input;
    if (!isPlainObject(base)) {
      throw new z.ZodError([
        {
          code: "custom",
          path: ["properties"],
          message: "properties must be an object",
        },
      ]);
    }
    const withDefault =
      base.lubeType === undefined ? { ...base, lubeType: DEFAULT_LUBE_TYPE } : base;
    return chainPropertiesSchema.parse(withDefault);
  }

  if (input === undefined || input === null) return {};
  return emptyPropertiesSchema.parse(input);
}

/** Normalize DB values for API responses (never null). */
export function normalizePropertiesForRead(category: string, stored: unknown): ComponentProperties {
  if (stored === undefined || stored === null) {
    return category === "chain" ? { lubeType: DEFAULT_LUBE_TYPE } : {};
  }
  if (category === "chain") {
    if (isPlainObject(stored) && stored.lubeType === undefined) {
      return { lubeType: DEFAULT_LUBE_TYPE };
    }
    // Allow legacy/unknown lube ids to pass through on read? Spec: keep legacy until remap.
    // For v1, parse strictly when valid; if lubeType is a string not in enum, still return it
    // only if we soft-read — keep strict parse for known shapes, fallback default if empty.
    const parsed = chainPropertiesSchema.safeParse(stored);
    if (parsed.success) return parsed.data;
    if (isPlainObject(stored) && typeof stored.lubeType === "string") {
      return { lubeType: stored.lubeType as LubeType };
    }
    return { lubeType: DEFAULT_LUBE_TYPE };
  }
  return {};
}
```

Note on read of removed enum values: returning `as LubeType` for unknown strings is intentional so old rows still display; writes still reject via `normalizePropertiesForWrite`.

- [ ] **Step 4: Export from `shared/src/index.ts`**

Add: `export * from "./schemas/component-properties.js";`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run -w shared test -- src/schemas.test.ts`  
Expected: PASS for new describe blocks.

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas/component-properties.ts shared/src/index.ts shared/src/schemas.test.ts
git commit -m "feat(shared): add component properties helpers for chain lube type"
```

---

### Task 2: Wire properties into component + filter schemas

**Files:**

- Modify: `shared/src/schemas/component.ts`
- Modify: `shared/src/schemas/component-filter.ts`
- Modify: `shared/src/schemas.test.ts`
- Run: `npm run -w shared build`

**Interfaces:**

- Consumes: `normalizePropertiesForWrite`, `lubeTypeSchema`, `ComponentProperties`
- Produces: `ComponentInsert.properties`, `ComponentUpdate.properties?`, `Component.properties`, `ComponentFilter.lubeTypes?`
- Produces: CSV column `lube_type` appended to `COMPONENT_CSV_COLUMNS`

- [ ] **Step 1: Extend failing insert/filter tests**

In `shared/src/schemas.test.ts`, add:

```typescript
it("defaults chain properties on insert when omitted", () => {
  const result = componentInsertSchema.safeParse({
    category: "chain",
    name: "Chain",
    brand: "Brand",
    model: "Model",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.properties).toEqual({ lubeType: "wet_lube" });
  }
});

it("rejects lubeType on non-chain insert", () => {
  const result = componentInsertSchema.safeParse({
    ...validComponent,
    properties: { lubeType: "wet_lube" },
  });
  expect(result.success).toBe(false);
});
```

Also assert `COMPONENT_CSV_COLUMNS` includes `"lube_type"` as the last column (update any existing column-order test).

- [ ] **Step 2: Run to verify fail**

Run: `npm run -w shared test -- src/schemas.test.ts`  
Expected: FAIL on properties defaults / CSV column.

- [ ] **Step 3: Update `component.ts`**

Import helpers. Add to insert via transform:

```typescript
import { normalizePropertiesForWrite, type ComponentProperties } from "./component-properties.js";

// on componentInsertSchema — use .transform after extend:
export const componentInsertSchema = componentBaseSchema
  .extend({
    category: z.enum(CATEGORY_IDS),
    brand: requiredString,
    model: requiredString,
    properties: z.unknown().optional(),
  })
  .transform((data) => ({
    ...data,
    properties: normalizePropertiesForWrite(data.category, data.properties),
  }));

export const componentUpdateSchema = z.object({
  // ...existing fields...
  /** Full replace when present; category-validated in service via normalizePropertiesForWrite. */
  properties: z.unknown().optional(),
});

export const componentSchema = componentBaseSchema.extend({
  id: z.string().uuid(),
  bikeId: z.string().uuid(),
  category: z.enum(CATEGORY_IDS),
  sortOrder: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  properties: z.record(z.string(), z.unknown()).default({}),
});

export const COMPONENT_CSV_COLUMNS = [
  "id",
  "category",
  "name",
  "brand",
  "model",
  "notes",
  "isActive",
  "distanceMeters",
  "movingTimeMinutes",
  "purchaseDate",
  "purchaseCost",
  "purchaseStore",
  "lube_type",
] as const;
```

Keep `COMPONENT_CSV_LEGACY_COLUMNS = COMPONENT_CSV_COLUMNS.slice(0, 7)` (unchanged meaning: first 7 cols).

Update `ComponentInsert` inference (transform output includes `properties: ComponentProperties`).

- [ ] **Step 4: Update `component-filter.ts`**

```typescript
import { lubeTypeSchema } from "./component-properties.js";

export const componentFilterSchema = z.object({
  // ...existing...
  lubeTypes: z.array(lubeTypeSchema).optional(),
});
```

- [ ] **Step 5: Fix any insert tests that break**

`componentInsertSchema.safeParse` for every category now yields `properties: {}` (non-chain) or `{ lubeType: "wet_lube" }` (chain). Update assertions if they do deep equality on full parse result. The existing “accepts every predefined category” only checks `success` — should still pass.

- [ ] **Step 6: Build shared**

Run: `npm run -w shared build`  
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add shared/src/schemas/component.ts shared/src/schemas/component-filter.ts shared/src/schemas.test.ts
git commit -m "feat(shared): wire properties into component and filter schemas"
```

---

### Task 3: DB column + migration backfill

**Files:**

- Modify: `server/src/db/schema.ts`
- Create: `server/drizzle/20260726120000_component_properties/migration.sql`

**Interfaces:**

- Produces: `components.properties: ComponentProperties | null` (Drizzle json text)

- [ ] **Step 1: Add column to Drizzle schema**

In `server/src/db/schema.ts`, import type if needed and add field after `notes` (or after purchase fields — order is free for sqlite add-column):

```typescript
import type { ComponentProperties } from "shared";

// inside components columns:
properties: text("properties", { mode: "json" }).$type<ComponentProperties | null>(),
```

- [ ] **Step 2: Hand-write migration** (same style as `20260714194500_maintenance_module`)

`server/drizzle/20260726120000_component_properties/migration.sql`:

```sql
ALTER TABLE `components` ADD `properties` text;
--> statement-breakpoint
UPDATE `components`
SET `properties` = '{"lubeType":"wet_lube"}'
WHERE `category` = 'chain'
  AND (`properties` IS NULL OR `properties` = '' OR `properties` = '{}');
```

If the migrator does not split on `--> statement-breakpoint`, use two statements the project already supports (check `runDrizzleMigrations` / recent migrations). Prefer matching whatever `20260704053807_handy_sersi` used for multi-statement ALTER+UPDATE.

- [ ] **Step 3: Apply migration**

Run: `npm run -w shared build && npm run -w logging build && npm run -w server db:migrate`  
Expected: migration applied without error.

- [ ] **Step 4: Smoke-check backfill** (optional local SQL)

Open DB and confirm a chain row has `{"lubeType":"wet_lube"}` if any exist; otherwise create one in a later test task.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/schema.ts server/drizzle/20260726120000_component_properties
git commit -m "feat(db): add components.properties JSON column and chain backfill"
```

---

### Task 4: Service create/update + lubeTypes filter

**Files:**

- Modify: `server/src/services/components.ts`
- Modify: `server/src/services/bikes.ts`
- Test: `server/src/test/graphql.test.ts` (or a focused service test if one exists — prefer GraphQL in Task 5; here add a small unit-style test only if services are tested directly)

**Interfaces:**

- Consumes: `normalizePropertiesForWrite`, `ComponentInsert.properties`
- Produces: persisted `properties` on create/update; filter `json_extract(properties, '$.lubeType') IN (...)`

- [ ] **Step 1: Persist properties in `createComponent`**

After Zod parse at GraphQL boundary, `data.properties` is already normalized for insert. Persist:

```typescript
properties: data.properties ?? {},
```

For non-chains insert schema yields `{}`. Store `{}` as JSON object (Drizzle mode json). Optionally store `null` for empty non-chain to save space — **spec prefers read as `{}`; storing `{}` or `null` both OK if read path uses `normalizePropertiesForRead`**. Prefer store `null` when empty and object when non-empty:

```typescript
const properties = data.properties;
// ...
properties: Object.keys(properties).length === 0 ? null : properties,
```

- [ ] **Step 2: Handle update**

In `updateComponent`, after `requireComponent`:

```typescript
import { normalizePropertiesForWrite } from "shared";

// existing row available from requireComponent — change require/update to keep category:
const existing = await requireComponent(...);
if (data.properties !== undefined) {
  const normalized = normalizePropertiesForWrite(existing.category, data.properties);
  updates.properties = Object.keys(normalized).length === 0 ? null : normalized;
}
```

- [ ] **Step 3: Filter in `buildComponentFilterConditions`**

```typescript
if (filter.lubeTypes && filter.lubeTypes.length > 0) {
  conditions.push(
    sql`json_extract(${components.properties}, '$.lubeType') IN (${sql.join(
      filter.lubeTypes.map((v) => sql`${v}`),
      sql`, `,
    )})`,
  );
}
```

(Verify `sql.join` pattern used elsewhere in repo; if not, use `inArray` on a sql fragment or `or(...eq)` equivalents.)

- [ ] **Step 4: Commit**

```bash
git add server/src/services/components.ts server/src/services/bikes.ts
git commit -m "feat(server): persist component properties and filter by lubeTypes"
```

---

### Task 5: GraphQL types, inputs, filter + tests

**Files:**

- Modify: `server/src/graphql/schema/component.ts`
- Modify: `server/src/graphql/schema/bike.ts`
- Modify: `server/src/graphql/component-filter.ts`
- Modify: `server/src/test/graphql.test.ts`
- Modify: `server/src/test/graphql-helper.ts` (extend create selection if needed)

**Interfaces:**

- Produces: GraphQL `LubeType`, `ComponentProperties`, `ComponentPropertiesInput`
- Produces: `Component.properties: ComponentProperties!`
- Produces: `ComponentFilterInput.lubeTypes`

- [ ] **Step 1: Write failing GraphQL tests**

In `server/src/test/graphql.test.ts` (follow existing `createBikeViaGraphql` / `createComponentViaGraphql` helpers):

```typescript
it("defaults chain lubeType to wet_lube when properties omitted", async () => {
  const bike = await createBikeViaGraphql(agent, "Hybrid");
  const created = await graphqlRequest<{
    createComponent: { id: string; properties: { lubeType: string } };
  }>(
    agent,
    `mutation($bikeId: ID!, $input: ComponentInsertInput!) {
      createComponent(bikeId: $bikeId, input: $input) { id properties { lubeType } }
    }`,
    {
      bikeId: bike.id,
      input: { category: "chain", name: "Chain", brand: "KMC", model: "X11" },
    },
  );
  expect(created.body.data.createComponent.properties.lubeType).toBe("wet_lube");
});

it("rejects lubeType on non-chain component", async () => {
  const bike = await createBikeViaGraphql(agent, "Hybrid");
  const res = await graphqlRequest(
    agent,
    `mutation($bikeId: ID!, $input: ComponentInsertInput!) {
      createComponent(bikeId: $bikeId, input: $input) { id }
    }`,
    {
      bikeId: bike.id,
      input: {
        category: "frame",
        name: "Frame",
        brand: "Brand",
        model: "Model",
        properties: { lubeType: "wet_lube" },
      },
    },
  );
  expect(res.body.errors?.length).toBeGreaterThan(0);
});

it("filters components by lubeTypes", async () => {
  // create two chains with different lube types, query bike.components(filter: { lubeTypes: [DRIP_WAX] })
  // expect only the drip_wax chain
});
```

Use the same GraphQL enum naming as `ComponentCategory` (values are the string ids; enum names may be `wet_lube` etc.).

- [ ] **Step 2: Run test — expect FAIL** (missing field / type)

Run: `npm run -w server test -- src/test/graphql.test.ts`  
Expected: GraphQL errors about unknown field `properties`.

- [ ] **Step 3: Add GraphQL types in `component.ts`**

```typescript
import { LUBE_TYPE_IDS, normalizePropertiesForRead } from "shared";

export const LubeTypeEnum = builder.enumType("LubeType", {
  values: Object.fromEntries(LUBE_TYPE_IDS.map((id) => [id, { value: id }])),
});

type PropertiesParent = { lubeType?: string };

export const ComponentPropertiesRef = builder.objectRef<PropertiesParent>("ComponentProperties");

builder.objectType(ComponentPropertiesRef, {
  fields: (t) => ({
    lubeType: t.field({
      type: LubeTypeEnum,
      nullable: true,
      resolve: (parent) => (parent.lubeType as (typeof LUBE_TYPE_IDS)[number] | undefined) ?? null,
    }),
  }),
});

// on Component fields:
properties: t.field({
  type: ComponentPropertiesRef,
  resolve: (parent) => normalizePropertiesForRead(parent.category, parent.properties),
}),
```

- [ ] **Step 4: Inputs in `bike.ts`**

```typescript
const ComponentPropertiesInput = builder.inputType("ComponentPropertiesInput", {
  fields: (t) => ({
    lubeType: t.field({ type: LubeTypeEnum, required: false }),
  }),
});

// Add to ComponentInsertInput and ComponentUpdateInput:
properties: t.field({ type: ComponentPropertiesInput, required: false }),
```

Ensure `componentInsertSchema.parse` / `componentUpdateSchema.parse` still run on the input object (properties included). For insert, Zod transform defaults chain lube.

- [ ] **Step 5: Filter input**

In `component-filter.ts`, import `LubeTypeEnum` from component schema (avoid circular import — define `LubeTypeEnum` in `component-filter.ts` or a tiny `lube-type.ts` graphql module if needed). Add:

```typescript
lubeTypes: t.field({ type: [LubeTypeEnum], required: false }),
```

Extend `mergeComponentFilter` rawFilter typing + pass-through (Zod parse already allows `lubeTypes`).

- [ ] **Step 6: Run GraphQL tests — expect PASS**

- [ ] **Step 7: Commit**

```bash
git add server/src/graphql server/src/test/graphql.test.ts server/src/test/graphql-helper.ts
git commit -m "feat(graphql): expose component properties and lubeTypes filter"
```

---

### Task 6: MCP catalog, serialize, create/update + tests

**Files:**

- Modify: `server/src/mcp/schema-catalog.ts`
- Modify: `server/src/mcp/serialize.ts`
- Modify: `server/src/mcp/tools/create-component.ts`
- Modify: `server/src/mcp/tools/update-component.ts`
- Modify: `server/src/mcp/filter-utils.ts` (if filter field list is explicit)
- Test: `server/src/test/mcp.test.ts`

**Interfaces:**

- Consumes: `normalizePropertiesForRead`, `componentInsertSchema` / `componentUpdateSchema`
- Produces: `properties` on serialized components; create/update accept `properties: { lubeType? }`; filter accepts `lubeTypes`

- [ ] **Step 1: Failing MCP test**

```typescript
it("create_component defaults chain lubeType and returns properties", async () => {
  // call create_component with category chain, no properties
  // expect structuredContent.component.properties.lubeType === "wet_lube"
});

it("update_component can set drip_wax", async () => {
  // create chain, update properties: { lubeType: "drip_wax" }, get_bike_components and assert
});

it("rejects properties.lubeType on frame via create_component", async () => {
  // expect isError
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement MCP wiring**

- `COMPONENT_FIELDS`: add `"properties"`
- `COMPONENT_FILTER_FIELDS`: add `"lubeTypes"`
- `serializeComponent`: add `properties: normalizePropertiesForRead(row.category, row.properties)`
- `create-component.ts`: include `properties` in the picked insert schema (optional)
- `update-component.ts`: allow optional `properties` in the strict input object, pass through `componentUpdateSchema.parse`
- `describe_data_model` / catalog notes: document chain-only `lubeType` values

- [ ] **Step 4: Run MCP tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add server/src/mcp server/src/test/mcp.test.ts
git commit -m "feat(mcp): expose component properties and lubeTypes filter"
```

---

### Task 7: CSV import/export `lube_type`

**Files:**

- Modify: `server/src/services/component-import.ts`
- Modify: `client/src/features/components/csv.ts` (template headers if it imports `COMPONENT_CSV_COLUMNS`)
- Test: existing CSV tests in server (grep `COMPONENT_CSV` / `importComponents`) — extend them

**Interfaces:**

- Consumes: `normalizePropertiesForWrite`, `COMPONENT_CSV_COLUMNS`
- Produces: export writes `lube_type` from `properties.lubeType`; import maps into `properties`

- [ ] **Step 1: Locate export/import mapping and add failing test** for chain round-trip + non-chain with `lube_type` rejected.

- [ ] **Step 2: Implement**

Export row builder: `lube_type: properties?.lubeType ?? ""` (empty for non-chain).

Import: when parsing a row, build `properties` from `lube_type` cell:

- if category === `chain` and cell empty/unknown → validation error (no soft-default)
- if category !== `chain` and cell non-empty → throw validation error
- if cell set → `properties: { lubeType: cell }` then run through existing insert/update validation

Require the current header including `lube_type` (reject older headers).

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat(csv): import/export chain lube_type via properties"
```

---

### Task 8: Client GraphQL types + ComponentForm lube select

**Files:**

- Modify: `client/src/lib/graphql/operations.ts`
- Modify: `client/src/features/components/ComponentForm.tsx`

**Interfaces:**

- Consumes: `LUBE_TYPE_IDS`, `LUBE_TYPE_LABELS`, `DEFAULT_LUBE_TYPE` from `shared`
- Produces: form field `lubeType` when `category === "chain"`; mutations send `properties: { lubeType }`

- [ ] **Step 1: Extend `ComponentGql` + all component selection sets**

```typescript
properties: {
  lubeType: string | null;
}
```

Add to `BIKE_DETAIL_QUERY`, create/update mutation selections, and `toComponentRow` mapping so `Component.properties` is populated (extend shared `Component` type already done in Task 2).

- [ ] **Step 2: Update `ComponentForm`**

- Extend local `formSchema` with optional `lubeType: z.enum(LUBE_TYPE_IDS).optional()`
- When `category === "chain"`, require it (`.superRefine` or conditional schema)
- Defaults: create → `DEFAULT_LUBE_TYPE`; edit → `component.properties?.lubeType ?? DEFAULT_LUBE_TYPE`
- UI: shadcn `Select` (same pattern as `client/src/routes/api-keys.tsx`) labeled “Lube type”, only rendered for chain
- `normalize()` output includes `properties: category === "chain" ? { lubeType } : undefined` (or `{}` for non-chain omit)

- [ ] **Step 3: Typecheck client**

Run: `npm run -w shared build && vp check` (or client typecheck as used in repo)  
Expected: no errors on form/operations.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/graphql/operations.ts client/src/features/components/ComponentForm.tsx
git commit -m "feat(client): chain lube type field on component form"
```

---

### Task 9: Display lube type (property pills)

**Files:**

- Modify: `client/src/features/components/CategoryDetailContent.tsx`
- Add: `client/src/features/components/component-property-pills.ts`

**Interfaces:**

- Consumes: `LUBE_TYPE_LABELS`, component `properties.lubeType`
- Produces: property pills on chain list/detail rows

Note: no client-side lube-type list filter. Server/GraphQL/MCP `lubeTypes` remains for API clients.

- [ ] **Step 1: Display**

Show chain lube type as shared property pills (list + detail). No properties chrome for other categories.

- [ ] **Step 2: (removed) Filter controls**

Deferred / not shipping: in-panel lube multi-select was dropped as unnecessary.

- [ ] **Step 3: Manual sanity check** (dev servers)

Run API + client; open a bike → Chain category → add/edit lube → confirm property pills.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/components/CategoryDetailContent.tsx client/src/features/components/component-property-pills.ts
git commit -m "feat(client): show chain lube type as property pills"
```

---

### Task 10: Verify + docs touch-up

**Files:**

- Modify: `AGENTS.md` only if component field docs should mention `properties` / MCP (short note under component reads or MCP tools)

- [ ] **Step 1: Full verify**

Run: `npm run verify`  
Expected: check + tests pass.

- [ ] **Step 2: Update AGENTS.md** (brief)

Document that components may include `properties` (chain `lubeType` enum) and filters accept `lubeTypes`.

- [ ] **Step 3: Final commit**

```bash
git add AGENTS.md
git commit -m "docs: note component properties and lubeTypes filter"
```

---

## Self-review (plan vs spec)

| Spec requirement                       | Task                                        |
| -------------------------------------- | ------------------------------------------- |
| TEXT JSON `properties` column          | Task 3                                      |
| Zod per-category + wet default         | Tasks 1–2                                   |
| API never null (`{}`)                  | Tasks 1, 4–6 (`normalizePropertiesForRead`) |
| Strict reject non-chain lube           | Tasks 1–2, 5–7                              |
| GraphQL structured `properties` + enum | Task 5                                      |
| Filter `lubeTypes`                     | Tasks 2, 4, 5, 6                            |
| MCP expose + filter                    | Task 6                                      |
| CSV `lube_type`                        | Tasks 2, 7                                  |
| UI select + property pills             | Tasks 8–9                                   |
| Migration backfill wet_lube            | Task 3                                      |
| No Turso jsonb / user custom fields    | Global constraints / non-goals              |

No TBD placeholders left. Types/names consistent: `normalizePropertiesForWrite` / `ForRead`, `lubeType`, `LUBE_TYPE_IDS`, GraphQL `LubeType` / `ComponentProperties`.
