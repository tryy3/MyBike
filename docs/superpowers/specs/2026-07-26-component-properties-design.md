# Component Properties (Category-Specific Fields)

**Date:** 2026-07-26  
**Status:** Approved (brainstorming)  
**Builds on:** Flat component model in `shared` / GraphQL / MCP / `ComponentForm`; categories in `shared/src/categories.ts`

## Summary

Add an app-defined, category-specific `properties` bag on components so fields like chain **lube type** can exist without boolean-prop sprawl or user-defined custom fields. First property: `lubeType` on `chain` only. Storage is TEXT JSON validated by Zod in `shared/`; API always exposes `properties` as an object (`{}` when empty).

## Goals

- Let users record how a chain is lubricated (oil vs wax variants)
- Keep the API/MCP shape as a nested `properties` object for future category-specific fields
- Enforce category rules strictly (chains get `lubeType`; other categories cannot set it)
- Support filtering by lube type from day one
- Default existing and newly created chains to wet lube when unset
- Keep UI/MCP changes minimal and category-scoped

## Non-goals

- User-defined custom properties or arbitrary metadata keys
- Turso STRICT tables, `json`/`jsonb` custom column types, or STRUCT/UNION (revisit later)
- Maintenance logic that branches on lube type
- Promoting `lubeType` to a top-level GraphQL field (lives under `properties`)
- Free-text lube type values

## Decisions

| Topic | Choice |
| --- | --- |
| Storage | TEXT JSON column `components.properties` via Drizzle `text(..., { mode: "json" })` |
| API shape | Nested `properties` object (always an object, never null) |
| Lube values | Fixed enum: `dry_lube`, `wet_lube`, `drip_wax`, `immersion_wax` |
| Non-chain writes with lube | Reject (validation error) |
| Chain requirement | Chains always have `lubeType`; default `wet_lube` when omitted on create/normalize |
| Filter | `lubeTypes: [...]` on component filter |
| Null in API | Avoid — return `{}` for components with no properties |

## Data model

### Column

```text
components.properties  TEXT  NULL  -- JSON object; NULL in DB means empty bag
```

Service layer normalizes:

- DB `NULL` or missing → API `{}`
- Chain without `lubeType` after normalize → `{ lubeType: "wet_lube" }` (create path / migration)

### Enum

Stable ids (stored in JSON):

| Id | UI label |
| --- | --- |
| `dry_lube` | Dry lube |
| `wet_lube` | Wet lube |
| `drip_wax` | Drip wax |
| `immersion_wax` | Immersion wax |

Default: `wet_lube`.

Enum evolution: adding values is additive in `shared/`. Removing values stops new writes; existing rows may keep legacy ids until a deliberate remap (not in this work).

### Per-category schemas (`shared/`)

- `chain` → `{ lubeType: LubeType }` (required after normalize)
- All other categories → empty object only (`z.object({}).strict()` or equivalent)
- Unknown keys rejected everywhere
- Create/update validation is **category-aware** (uses create input category, or stored category on update)

Suggested modules:

- `shared/src/schemas/component-properties.ts` — enum, labels, per-category schemas, `parseComponentProperties(category, value)`
- Wire into `componentInsertSchema` / `componentUpdateSchema` / `componentSchema` and `componentFilterSchema`

### Migration

1. Add `properties` column (nullable TEXT).
2. Backfill: `UPDATE components SET properties = '{"lubeType":"wet_lube"}' WHERE category = 'chain' AND (properties IS NULL OR properties = '' OR properties = '{}')`.
3. Non-chain rows remain `NULL` (read as `{}`).

## API surface

### GraphQL

- `Component.properties`: non-null object type (e.g. `ComponentProperties`) with optional/known fields; today effectively `{ lubeType: LubeType }` for chains and `{}` for others. Prefer structured fields over a raw JSON scalar so MCP/LLM clients see a clear schema.
- Create/update inputs accept `properties` the same way; validation via shared Zod.
- Filter: extend component filter with `lubeTypes: [LubeType!]`; SQL uses `json_extract(properties, '$.lubeType')` (or `->>`) `IN (...)`. Rows without that key do not match.

### MCP

- Expose `properties` on component field catalogs and create/update/list tools.
- Mirror `lubeTypes` on list/filter inputs.
- No new tools.

### CSV

- Optional `lube_type` column maps to `properties.lubeType` for chain rows.
- Import: missing lube on chain → default `wet_lube`; non-chain with lube column set → validation error (same rules as API).

### Normalization rules

| Case | Behavior |
| --- | --- |
| Non-chain, omit `properties` | Store/treat as `{}` |
| Non-chain, `properties: {}` | OK |
| Non-chain, any keys | Reject |
| Chain create, omit `properties` or omit `lubeType` | Default `{ lubeType: "wet_lube" }` |
| Chain create/update, valid `lubeType` | Store as given |
| Chain update sending `properties` without `lubeType` | Default `wet_lube` |
| Invalid enum | Reject |

v1 treats `properties` on update as a **full replace** of the bag (bag is tiny). No deep-merge unless more keys appear later and require it.

## UI

- **Form:** In `ComponentForm`, when `category === "chain"`, show a required “Lube type” select (four labels). Preselect Wet lube on create; show stored value on edit.
- **Display:** Show lube type on chain list/detail (secondary labeled value). No properties chrome for other categories.
- **Filter:** Optional lube-type multi-select wired to GraphQL `lubeTypes`. Show it only in chain context (e.g. when the category panel/filter is chain); hide otherwise.

## Errors

Same style as existing Zod → GraphQL/MCP validation errors:

- Unknown property keys
- `lubeType` on non-chain
- Invalid enum value

## Testing

- Shared Zod: chain default/required shape; non-chain reject; unknown keys; enum
- Server: migration backfill; GraphQL create/update; filter by `lubeTypes`; MCP create/update/list round-trip
- Defaulting: omit `properties` on chain create → `wet_lube`

## Implementation map

| Layer | Change |
| --- | --- |
| `shared` | lube enum, property schemas, category-aware create/update, filter, CSV column |
| `server` db | `properties` column + backfill migration |
| `server` services | normalize `{}`, default wet for chains, JSON extract filter |
| GraphQL | `properties` on type/inputs; `lubeTypes` on filter; enum type |
| MCP | field catalog + create/update/list/filter |
| Client | chain-only select + display + filter wiring |

## Future upgrade path (out of scope)

If Turso custom types stabilize and we want DB-level JSON validity:

1. Enable experimental `custom_types` and rebuild `components` as STRICT (table recreate + FK-aware migration).
2. Change column affinity to Turso `json` or `jsonb`.
3. Keep Zod as source of truth for shape and category rules (`json`/`jsonb` only guarantee well-formed JSON).

If a property becomes a hot filter path, promote it to a real column or expression index while keeping the API bag for compatibility.

## Open follow-ups (explicitly deferred)

- User-editable notes/metadata beyond existing `notes`
- Additional category properties (tire pressure, cassette speeds, etc.)
- Maintenance templates or due logic keyed on lube type
- Remapping strategy when removing enum values
