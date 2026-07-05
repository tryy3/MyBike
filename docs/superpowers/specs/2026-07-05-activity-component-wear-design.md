# Activity–Component Wear Model (v2)

**Date:** 2026-07-05  
**Status:** Approved (brainstorming)  
**Supersedes (partially):** `2026-07-05-strava-stats-display-design.md` — component wear source of truth moves from denormalized counters to the junction table + baseline.

## Summary

Redesign how Strava ride mileage flows into component wear. **`activity_component` becomes the ledger** for Strava-sourced wear per ride. **`components.distanceMeters`** becomes a **positive baseline only** (pre-MyBike wear, parts moved from another bike). Display total = Strava wear (sum of junction) + baseline.

Corrections (wrong distance, wrong components for a ride) happen at the **activity** level, not via negative component offsets. Users can pick **any component on the bike** when editing which parts were used on a specific ride.

## Goals

- Immutable per-ride links: each activity processed once; junction rows define which components were credited
- Support **component swaps** (wax chains, wheel sets): rides stay linked to the components active when each ride was first processed; swapping later does not rewrite history
- **Incremental Strava sync** only; never rebuild or overwrite existing activity/junction data
- **First import compromise:** store all activities for bike-level totals; link components only from a cutoff date (default: Strava link date)
- **Baseline** on components: optional, positive-only manual offset; separate from Strava ledger
- **Activity edit UI** (Phase 2): list rides per bike; edit distance/time and linked components
- Stats API derives component wear from junction + baseline (not denormalized sync increments)

## Non-goals (this spec)

- Negative baseline or component-level negative adjustments
- Per-component distance override on junction rows (v1 uses full activity distance per linked component — same as today)
- Automatic activation history / `installed_at` inference
- Re-import or overwrite of historical Strava data
- Maintenance thresholds, alerts, service intervals
- Manual (non-Strava) activities — future work; schema should not block it

## Concepts

| Term              | Meaning                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| **Activity**      | One ride (from Strava today). Stored in `strava_activities`.                                |
| **Baseline**      | User-entered starting wear on a component, ≥ 0, independent of Strava.                      |
| **Strava wear**   | `SUM(activity_component)` for that component.                                               |
| **Display total** | Strava wear + baseline (what UI shows for maintenance).                                     |
| **Credit cutoff** | Activities before this date get stored but no `activity_component` rows (bike totals only). |

## Data model

### Unchanged

- `bikes` — garage bikes
- `components` — parts per bike, one active per category, alternates via `isActive`

### New: `strava_bikes`

Explicit link between Strava gear and MyBike bike (replaces sole reliance on `bikes.strava_gear_id`).

| Column                  | Type            | Notes                                                                       |
| ----------------------- | --------------- | --------------------------------------------------------------------------- |
| `id`                    | text PK         |                                                                             |
| `user_id`               | text FK → user  |                                                                             |
| `strava_gear_id`        | text            | Strava gear id                                                              |
| `bike_id`               | text FK → bikes | MyBike bike                                                                 |
| `linked_at`             | integer         | ms epoch; when link was created                                             |
| `component_credit_from` | text            | ISO date `YYYY-MM-DD`; activities before this date: no auto component links |

Unique: `(user_id, strava_gear_id)`, `(user_id, bike_id)` — one Strava gear ↔ one MyBike bike per user.

**Migration:** For each bike with non-null `strava_gear_id`, insert `strava_bikes` row; set `component_credit_from` = link date (today at migration, or `linked_at` date).

Keep `bikes.strava_gear_id` during transition (dual-read); remove in a later cleanup migration once all code uses `strava_bikes`.

### Existing: `strava_activities` (conceptual **activity**)

Keep table name for now. Columns sufficient for v1:

- `user_id`, `bike_id`, `strava_activity_id`, `strava_gear_id`
- `distance_meters`, `moving_time_minutes`, `start_date`
- `processed_at`

**Phase 2 additions (optional columns):**

- `edited_at` — user changed distance or components
- `source` — `strava` (default) | `manual` (future)

Activities are editable: distance and moving time can be corrected without touching Strava.

### Existing: `strava_activity_components` (conceptual **activity_component**)

Ledger row: this activity credited this component with this distance/time.

| Column                | Notes                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `activity_id`         | FK → strava_activities                                            |
| `component_id`        | FK → components                                                   |
| `distance_meters`     | Usually equals activity distance (full ride credit per component) |
| `moving_time_minutes` | Usually equals activity moving time                               |

Unique: `(activity_id, component_id)`.

**Authoritative for Strava wear.** Never updated by sync after initial insert; user edits replace rows for that activity in Phase 2.

### Components: baseline semantics

Repurpose existing columns (no rename required for v1; document in UI as “Starting distance” / “Baseline”):

| Column                | New semantics                        |
| --------------------- | ------------------------------------ |
| `distance_meters`     | Baseline distance (≥ 0, nullable)    |
| `moving_time_minutes` | Baseline moving time (≥ 0, nullable) |

**Stop incrementing these on Strava sync.**

Validation (`shared` Zod): allow 0; disallow negative values.

## Sync & import behavior

### Resolve bike

```
activity.strava_gear_id → strava_bikes → bike_id
```

Fallback during transition: `bikes.strava_gear_id` if no `strava_bikes` row.

### Process one Strava activity (transaction)

1. If `(user_id, strava_activity_id)` exists → **skip** (idempotent).
2. Resolve MyBike bike via `strava_bikes` / `strava_gear_id`. If none → skip.
3. Insert `strava_activities` row.
4. **Component linking:** If `activity.start_date < strava_bikes.component_credit_from` → **no junction rows** (bike-level activity only).
5. Else: for each **currently active** component on that bike → insert `strava_activity_components` with activity’s distance/time.
6. **Do not** update `components.distance_meters` / `moving_time_minutes`.

### First Strava import (`import/commit`)

- Create/update `strava_bikes` when user links or creates a bike.
- Set `component_credit_from` = **today’s date** (UTC date of import) unless user opts in to credit history (UI checkbox, default **off**).
- Process all fetched activities through the flow above.

### Ongoing sync (`POST /sync`)

- Fetch activities from Strava; prefer **`after`** timestamp = latest `start_date` (or `processed_at`) already stored for user to minimize API payload.
- Same `processActivity` logic; duplicates skipped.

### Swaps (wax chains, wheel sets)

When ride is **first processed**, active components get junction rows. Deactivating/swap later does not alter past rows. New rides credit whatever is active at **their** first process time.

## Wear & stats queries

### Component display total

```sql
-- strava_wear
SELECT component_id,
       SUM(distance_meters) AS strava_distance,
       SUM(moving_time_minutes) AS strava_time
FROM strava_activity_components
GROUP BY component_id;

-- display
display_distance = strava_distance + COALESCE(baseline_distance, 0)
display_time     = strava_time     + COALESCE(baseline_time, 0)
```

### Bike ride totals

```sql
SELECT SUM(distance_meters), SUM(moving_time_minutes), COUNT(*)
FROM strava_activities
WHERE bike_id = ?
```

Unchanged from current stats API intent; independent of component linking.

### Reset Strava wear for a component

Delete all `strava_activity_components` for `component_id`. Baseline unchanged. Display total recalculates to baseline only.

(Optional future: delete junction rows for date range only.)

## Data migration (existing installs)

For each component:

1. `strava_wear = SUM(strava_activity_components)` (0 if none).
2. `baseline = max(0, coalesce(components.distance_meters, 0) - strava_wear)` (same for time).
3. Write back `components.distance_meters = baseline` (or null if 0).

This splits today’s combined counter into baseline + ledger without double-counting after code switch.

Run migration in a server script or SQL migration step after deploy.

## API changes

### Phase 1

| Change                     | Detail                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `processActivity`          | No component increment; respect `component_credit_from`                                              |
| `GET /api/stats/bikes/:id` | Component wear = junction sum + baseline                                                             |
| `GET /api/stats/garage`    | Unchanged (activities only)                                                                          |
| Component CRUD             | `distanceMeters` documented as baseline; form label “Starting distance”                              |
| Strava import              | Set `strava_bikes.component_credit_from`; optional `creditHistoricalComponents` flag (default false) |

### Phase 2: Activities

| Method | Path                            | Purpose                                                      |
| ------ | ------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/bikes/:bikeId/activities` | Paginated list: date, distance, time, linked component names |
| GET    | `/api/activities/:id`           | Detail + component ids                                       |
| PATCH  | `/api/activities/:id`           | Update distance/time; replace linked `componentIds[]`        |

**PATCH rules:**

- User must own activity (via bike).
- `componentIds` must all belong to activity’s bike (any component, active or not — user’s choice).
- Typically expect one component per category but **not enforced** server-side.
- Replace junction rows atomically; set `edited_at`.
- Do not call Strava.

### Phase 2: Client

- New **Activities** tab on bike detail (or sub-route `/bikes/:id/activities`).
- Activity list + edit dialog (distance, time, multi-select components from bike’s full component list).
- Invalidate stats + bike detail queries on save.

## UI copy

| Old label                       | New label                                                           |
| ------------------------------- | ------------------------------------------------------------------- |
| Distance (km) in component form | **Starting distance (km)** — “Wear before MyBike / Strava tracking” |
| (implicit)                      | Help text: ride mileage comes from synced activities                |

## Phasing

| Phase  | Deliverable                                                                 |
| ------ | --------------------------------------------------------------------------- |
| **1a** | `strava_bikes` table + migration from `strava_gear_id`                      |
| **1b** | Sync rewrite + `component_credit_from` + data migration script              |
| **1c** | Stats API + UI use display total (junction + baseline)                      |
| **1d** | Import UI: optional “Credit past rides to current components” (default off) |
| **2**  | Activity list + PATCH edit API + UI                                         |

## Decisions log

| Decision                       | Choice                            | Rationale                                        |
| ------------------------------ | --------------------------------- | ------------------------------------------------ |
| Component wear source of truth | `strava_activity_components`      | Enables recalc, reset, per-ride edit             |
| Component `distanceMeters`     | Positive baseline only            | Pre-existing wear; no negative offsets           |
| Wrong ride distance            | Edit activity                     | Not component baseline                           |
| Wrong components on ride       | Edit activity links               | Any component on bike selectable                 |
| Historical component credit    | Default off on first import       | Strava history ≠ current component setup         |
| Credit rule for new rides      | Active components at process time | Matches swap workflow; immutable once written    |
| Table renames                  | Defer                             | Keep `strava_*` names; conceptual rename in docs |

## Testing

### Phase 1

- Sync does not increment `components.distance_meters`
- Activity before `component_credit_from` → activity row only, no junction
- Activity after cutoff → junction for each active component
- Re-sync same activity → skipped, junction unchanged
- Swap components between syncs → different junction targets per ride
- Migration script: baseline + junction sum equals pre-migration total
- Stats API returns junction + baseline

### Phase 2

- List activities scoped to bike + user
- PATCH updates activity fields and junction set
- PATCH with component from another bike → 400
- Display totals update after activity edit

## Future extensions (out of scope)

- Manual activities (`source = manual`)
- Strava webhook incremental sync
- Per-category single-component enforcement on activity edit
- Splitting one ride’s distance across components unequally
- Negative adjustments at activity level (edit distance down — already supported by editing activity meters)
