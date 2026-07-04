# Component Fields & Combobox Suggestions

**Date:** 2026-07-04  
**Status:** Approved (brainstorming)

## Summary

Extend bike components with optional lifetime-usage and purchase metadata, tighten validation so brand/model are required, and replace plain text inputs with creatable comboboxes for repeatable string fields. Suggestions come from a new garage-wide API endpoint.

Future work (out of scope): Strava integration for automatic distance/time, user-level metric/imperial display preference, currency preference for purchase cost.

## Goals

- Capture optional lifetime usage (distance, moving time) for manual wear tracking
- Capture optional purchase metadata (date, cost, store)
- Require `name`, `brand`, and `model` on save (notes stay optional)
- Reduce duplicate/inconsistent strings via combobox suggestions from prior entries
- Keep schema/API canonical; defer display preferences to a later user-settings feature

## Non-goals

- Strava/Garmin integration
- User profile settings (unit system, currency)
- Surfacing new fields in component list rows (form only for now)
- Strict normalized lookup tables for brands/stores
- Per-ride activity attribution

## Data Model

### New columns on `components`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `distance_meters` | `integer` | yes | Canonical distance storage |
| `moving_time_minutes` | `integer` | yes | Total minutes |
| `purchase_date` | `text` | yes | ISO `YYYY-MM-DD` |
| `purchase_cost` | `real` | yes | Plain number, no currency |
| `purchase_store` | `text` | yes | Free text |

Drizzle column names: `distanceMeters`, `movingTimeMinutes`, `purchaseDate`, `purchaseCost`, `purchaseStore`.

### Distance semantics

- **Database and API:** always integer meters; `null` = unknown
- **Form (v1):** user enters kilometers with up to one decimal (e.g. `2400.5` km → `2400500` meters)
- **Future:** user display preference (metric/imperial) converts on load/save only; DB stays meters
- Rounding loss on conversion is acceptable for estimate data

### Moving time semantics

- **Database and API:** total integer minutes
- **Form:** separate hours and minutes inputs; combined on save (`hours * 60 + minutes`)
- Either sub-field can be empty; both empty → `null`

### Validation (`shared` Zod schemas)

**Required on insert/update (after trim):**

- `name` — min 1, max 200
- `brand` — min 1, max 200
- `model` — min 1, max 200

**Optional:**

- `notes` — max 5000, nullish
- `distanceMeters` — integer ≥ 0 when present; `null` when cleared
- `movingTimeMinutes` — integer ≥ 0 when present
- `purchaseDate` — valid `YYYY-MM-DD` when present
- `purchaseCost` — number ≥ 0 when present
- `purchaseStore` — max 200, nullish

**Existing data:** rows with null brand/model remain valid in DB until edited; the form enforces required fields on save.

### CSV import/export

Extend `COMPONENT_CSV_COLUMNS` (append after existing columns):

```
distanceMeters, movingTimeMinutes, purchaseDate, purchaseCost, purchaseStore
```

- Export `distanceMeters` as integer meters
- Export `movingTimeMinutes` as integer total minutes
- Import: empty cells → `null`; validate same rules as API
- Older CSVs without new columns still import (missing columns treated as empty)

## API

### Existing routes (updated)

`POST /api/bikes/:bikeId/components` and `PATCH /api/components/:id` accept the new fields via updated shared schemas. Response bodies include new fields on `Component`.

### New route: `GET /api/field-suggestions`

Authenticated. Returns distinct string values across **all** of the user's components (all bikes).

**Response:**

```json
{
  "name": ["Stock chain", "Worn chain"],
  "brand": ["Shimano", "SRAM"],
  "model": ["105 R7000", "GX Eagle"],
  "purchaseStore": ["Local bike shop", "Chain Reaction"]
}
```

**Rules:**

- Only non-null, non-empty trimmed strings
- Case-insensitive deduplication; keep first-seen casing as canonical (`"Bianchi"` over `"bianchi"`)
- Alphabetically sorted per field
- v1 returns full lists (no `?q=` filter); garage scale is small

**Implementation:** single SQL query per field (or one query with aggregation) joining `components` → `bikes` filtered by `userId`.

## UI

### Dependencies

Add shadcn **Combobox** component to `client/src/components/ui/`.

### `ComboboxField` (new shared form primitive)

- Wraps shadcn Combobox + react-hook-form `Controller`
- Props: `name`, `label`, `placeholder`, `suggestions: string[]`
- **Creatable:** user can type values not in the list
- Client-side filter as user types
- Selecting a suggestion fills the canonical string

### `ComponentForm` changes

| Field | Control | Combobox |
|-------|---------|----------|
| Name | ComboboxField | yes |
| Brand | ComboboxField | yes |
| Model | ComboboxField | yes |
| Distance | Number input, label **"Distance (km)"** | no |
| Moving time | Hours + minutes number inputs | no |
| Purchase date | `<input type="date">` | no |
| Purchase cost | Number input (no currency) | no |
| Purchase store | ComboboxField | yes |
| Notes | Textarea | no |

**Distance form logic:**

- Load: `distanceMeters / 1000` → display km (one decimal)
- Save: `Math.round(km * 1000)` → `distanceMeters`; empty → `null`

**Moving time form logic:**

- Load: `Math.floor(minutes / 60)` hours, `minutes % 60` minutes
- Save: combine to total minutes; both empty → `null`

### Data fetching

- `useFieldSuggestions()` TanStack Query hook → `GET /api/field-suggestions`
- Invalidate on component create/update/delete (suggestions may change)
- Pass relevant slices to each `ComboboxField`

### Component list (`CategorySection`)

No changes in v1. Row still shows name + `brand · model`.

## Error Handling

- Server: existing validation/error patterns (`parseBody`, Zod, `HttpError`)
- Client: form validation via zodResolver; toast on API failure (unchanged)
- CSV import: reject rows with invalid new field values; report row errors as today

## Testing

**Shared:**

- Schema accepts/rejects new fields and required brand/model
- CSV column list includes new columns

**Server:**

- Migration applies cleanly
- CRUD with new fields round-trips
- `GET /api/field-suggestions` returns user-scoped deduped values
- CSV import/export with new columns

**Client:**

- Optional; form conversion logic (km ↔ meters, hours/minutes ↔ minutes) if extracted to testable helpers

## Migration

1. Generate Drizzle migration adding five nullable columns to `components`
2. No data backfill
3. Rebuild `shared` after schema changes

## Implementation Order

1. `shared` — Zod schemas, types, CSV columns
2. `server` — DB schema, migration, routes, suggestions endpoint, CSV
3. `client` — shadcn Combobox, `ComboboxField`, form updates, API hook
4. Tests + `vp check`
