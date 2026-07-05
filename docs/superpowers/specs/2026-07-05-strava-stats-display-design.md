# Strava Stats Display (Wear & Mileage)

**Date:** 2026-07-05  
**Status:** Approved (brainstorming)

## Summary

Surface Strava-synced distance and moving time across the app for maintenance-oriented wear tracking. Display-only in v1 — no thresholds, alerts, or maintenance workflows. UI is structured so future maintenance features (lifespan hints, user-defined limits, badges) can extend the same components and stats API without rework.

Approach: **dedicated stats API** (`/api/stats/*`) separate from bike CRUD, aggregating ride totals from `strava_activities` and component wear from `components`.

## Goals

- Show **distance + moving time** on component rows (wear per part)
- Show **bike ride totals** on the home bikes list
- Enrich the bike **Overview** tab with ride summary and a component wear breakdown
- Use **correct bike-level totals** (sum of `strava_activities`, not sum of component distances — active components each receive full ride credit)
- Invalidate stats queries after Strava sync/import
- Extract shared formatters reused by integrations and stats UI

## Non-goals

- Maintenance thresholds, progress bars, or “due soon” badges
- Activity history page or per-ride timeline
- New DB columns or migrations
- Changing how Strava sync credits components
- Strava connect CTAs outside the integrations page
- User unit preferences (km/h only, matching integrations import preview)

## Context

Strava sync already:

- Stores processed rides in `strava_activities` (per bike: `distanceMeters`, `movingTimeMinutes`, `startDate`)
- Increments **every active component** on the linked bike by each activity’s distance/time
- Exposes component `distanceMeters` / `movingTimeMinutes` on existing bike detail API

Currently visible only in: integrations import preview dialog and component edit form.

## API Design

### Router

New file: `server/src/routes/stats.ts`, mounted at `/api/stats` in `server/src/index.ts` (or `app.ts`). Uses `requireAuth` like other resource routes.

### Endpoints

#### `GET /api/stats/garage`

Returns ride totals for all bikes belonging to the authenticated user. Used by the home list.

**Response shape** (`garageStatsSchema`):

```ts
{
  bikes: {
    bikeId: string;
    rideStats: {
      distanceMeters: number;
      movingTimeMinutes: number;
      activityCount: number;
    } | null;
  }[];
}
```

- `rideStats` is `null` when the bike has no rows in `strava_activities`
- Aggregation: `SUM(distance_meters)`, `SUM(moving_time_minutes)`, `COUNT(*)` grouped by `bike_id`, scoped to `user_id`

#### `GET /api/stats/bikes/:bikeId`

Returns ride totals plus component wear for one bike. Used by the Overview tab (and available for future features).

**Response shape** (`bikeStatsSchema`):

```ts
{
  bikeId: string;
  rideStats: {
    distanceMeters: number;
    movingTimeMinutes: number;
    activityCount: number;
  } | null;
  components: {
    id: string;
    category: string;
    name: string;
    brand: string | null;
    model: string | null;
    distanceMeters: number | null;
    movingTimeMinutes: number | null;
    isActive: boolean;
  }[];
}
```

- `rideStats`: same aggregation as garage, filtered to one `bikeId`
- `components`: all components for the bike, sorted by `distanceMeters` descending (nulls last), then `sortOrder`
- Returns `404` if bike does not exist or belongs to another user

### Shared schemas

New file: `shared/src/schemas/stats.ts` with Zod schemas and exported types. Re-export from `shared/src/index.ts`.

### Bike CRUD unchanged

`GET /api/bikes` and `GET /api/bikes/:id` are not extended. Stats are fetched in parallel on the client.

## Client Design

### Data fetching

New module: `client/src/features/stats/api.ts`

| Hook                   | Query key                     | Endpoint                       |
| ---------------------- | ----------------------------- | ------------------------------ |
| `useGarageStats()`     | `queryKeys.garageStats`       | `GET /api/stats/garage`        |
| `useBikeStats(bikeId)` | `queryKeys.bikeStats(bikeId)` | `GET /api/stats/bikes/:bikeId` |

Add keys to `client/src/lib/query-keys.ts`.

**Parallel fetch:**

- Home: `useBikes()` + `useGarageStats()` — join by `bikeId` client-side
- Bike detail Overview: `useBike(bikeId)` + `useBikeStats(bikeId)` — prefetch stats on page load (not lazy per tab) so Overview is instant when selected

### Query invalidation

Update `client/src/features/strava/api.ts`:

- After successful sync **and** import commit, invalidate:
  - `queryKeys.garageStats`
  - `queryKeys.bikeStats` (prefix / all bike stats queries)
  - Existing: `queryKeys.stravaStatus`, `queryKeys.bikes`
  - Also invalidate `queryKeys.bike(bikeId)` for open detail pages (component row data)

### Formatters

New file: `client/src/lib/format-stats.ts`

Move from `integrations.tsx`:

- `formatDistance(meters)` → e.g. `"2,400 km"` (1 decimal max)
- `formatMovingTime(minutes)` → e.g. `"142 h"` or `"45 min"`

Add:

- `formatStatsLine(meters, minutes)` → `"2,400 km · 142 h"`
- `hasStats(meters, minutes)` → true when either is non-null and > 0

Update `integrations.tsx` to import from `format-stats.ts`.

### UI components

New file: `client/src/features/stats/ComponentStats.tsx`

```tsx
// Display-only wrapper; future threshold badge slots beside children
<ComponentStats distanceMeters={...} movingTimeMinutes={...} className="text-xs text-muted-foreground tabular-nums" />
```

Renders `formatStatsLine` or `—` when no stats.

## UI Placements

### 1. Home list (`client/src/routes/bikes-list.tsx`)

- Add **Mileage** column (md+ breakpoint, right-aligned, `tabular-nums`)
- **Mobile:** show stats as a third subtitle line under bike name/year
- Value: join garage stats → `formatStatsLine` or `—`
- Keep existing component count column

### 2. Component rows (`client/src/features/components/CategoryDetailContent.tsx`)

- Below brand/model line in `ComponentRow`, render `<ComponentStats />` using fields from the existing `Component` object (no extra fetch)
- Applies to both active and alternate rows when they have mileage

### 3. Overview tab (`client/src/routes/bike-detail.tsx`)

Replace the single summary card with two sections (same card or two cards — implementer’s choice; two cards preferred for scanability):

**Ride summary** (from `useBikeStats`):

| Label          | Source                        |
| -------------- | ----------------------------- |
| Total distance | `rideStats.distanceMeters`    |
| Moving time    | `rideStats.movingTimeMinutes` |
| Rides synced   | `rideStats.activityCount`     |

Use existing `OverviewRow` pattern. Show `—` for all rows when `rideStats` is null.

**Component wear** (from `bikeStats.components`):

- List **active** components with `hasStats` first, sorted by server (already distance desc)
- Each row: category label, component name, `formatStatsLine`
- Omit inactive alternates unless they have stats (server returns all; client filters)
- Empty state: “No component mileage yet — sync Strava or enter usage in a component’s edit form.”

### Empty states

- No stats: display `—` (not `"0 km · 0 min"`)
- No Strava connection: no inline CTA; stats simply absent until data exists

## Testing

### Server (`server/src/test/stats.test.ts` or extend `strava.test.ts`)

- `GET /api/stats/garage` returns per-bike ride totals after Strava sync
- `GET /api/stats/garage` returns `rideStats: null` for bikes without activities
- `GET /api/stats/bikes/:id` returns ride totals + components sorted by distance
- `GET /api/stats/bikes/:id` returns 404 for another user’s bike
- Unauthenticated requests return 401

### Manual test plan

1. Connect Strava, import/sync rides
2. Home list shows km · h per linked bike
3. Bike detail component rows show per-component wear
4. Overview shows ride summary and wear list
5. Sync again — all surfaces update without hard refresh

## Future extensibility

| Later feature           | Extension point                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Maintenance thresholds  | Add optional `serviceLimitMeters` on components; `ComponentStats` renders progress badge |
| Category lifespan hints | `bikeStats` adds `categoryHints` or client-side map                                      |
| Activity history        | New `GET /api/stats/bikes/:id/activities` on same router                                 |
| Dashboard totals        | Extend `GET /api/stats/garage` with garage-wide sums                                     |

## Files to create/modify

| File                                                       | Action                   |
| ---------------------------------------------------------- | ------------------------ |
| `shared/src/schemas/stats.ts`                              | Create                   |
| `shared/src/index.ts`                                      | Export stats schemas     |
| `server/src/routes/stats.ts`                               | Create                   |
| `server/src/index.ts`                                      | Mount stats router       |
| `server/src/test/stats.test.ts`                            | Create                   |
| `client/src/lib/format-stats.ts`                           | Create                   |
| `client/src/lib/query-keys.ts`                             | Add stats keys           |
| `client/src/features/stats/api.ts`                         | Create                   |
| `client/src/features/stats/ComponentStats.tsx`             | Create                   |
| `client/src/routes/bikes-list.tsx`                         | Mileage column           |
| `client/src/routes/bike-detail.tsx`                        | Overview stats           |
| `client/src/features/components/CategoryDetailContent.tsx` | Component row stats      |
| `client/src/routes/integrations.tsx`                       | Use shared formatters    |
| `client/src/features/strava/api.ts`                        | Invalidate stats queries |

## Decisions log

| Decision                  | Choice                   | Rationale                                                  |
| ------------------------- | ------------------------ | ---------------------------------------------------------- |
| Bike total source         | `strava_activities` sum  | Avoids over-counting from multi-component credit           |
| API shape                 | Dedicated `/api/stats/*` | Room for maintenance/history without bloating bike CRUD    |
| Component row data source | Existing bike detail     | Already loaded; no N+1                                     |
| Display metrics           | Distance + moving time   | User preference for maintenance context                    |
| v1 scope                  | Display only             | Maintenance features deferred; UI structured for extension |
