# Activity–Component Wear Model (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `strava_activity_components` the Strava wear ledger, repurpose component distance fields as positive baseline only, add `strava_bikes` link table with credit cutoff, and update sync/stats accordingly (Phase 1). Phase 2 adds activity list + edit.

**Architecture:** Sync inserts activities then junction rows for active components (if after cutoff); never mutates baseline on sync. Display wear = SUM(junction) + baseline. Migration splits existing combined counters.

**Spec:** `docs/superpowers/specs/2026-07-05-activity-component-wear-design.md`

**Tech stack:** Drizzle + SQLite, Express, shared Zod, TanStack Query, Vitest (`vite-plus/test`).

---

## File map (Phase 1)

| File                                               | Action                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| `server/src/db/schema.ts`                          | Add `stravaBikes` table                                |
| `server/drizzle/*`                                 | Generated migration                                    |
| `server/scripts/migrate-wear-baseline.ts`          | One-time baseline split script                         |
| `server/src/routes/strava.ts`                      | Rewrite `processActivity`, import sets cutoff          |
| `server/src/routes/stats.ts`                       | Component wear from junction + baseline                |
| `shared/src/schemas/strava.ts`                     | Optional `creditHistoricalComponents` on import commit |
| `shared/src/schemas/component.ts`                  | Document baseline; ensure min(0)                       |
| `client/src/features/components/ComponentForm.tsx` | Label “Starting distance”                              |
| `server/src/test/strava.test.ts`                   | Update expectations (no increment)                     |
| `server/src/test/stats.test.ts`                    | Junction-based wear tests                              |
| `server/src/test/wear-migration.test.ts`           | Baseline split logic tests                             |

## File map (Phase 2)

| File                                | Action                              |
| ----------------------------------- | ----------------------------------- |
| `shared/src/schemas/activity.ts`    | Activity list/detail/update schemas |
| `server/src/routes/activities.ts`   | GET list, GET one, PATCH            |
| `server/src/app.ts`                 | Mount router                        |
| `client/src/features/activities/*`  | API + list + edit dialog            |
| `client/src/routes/bike-detail.tsx` | Activities tab                      |

---

# Phase 1

### Task 1: `strava_bikes` schema + migration

**Files:**

- Modify: `server/src/db/schema.ts`
- Modify: `server/src/db/relations.ts`
- Generate: migration via `npm run -w server db:generate`

- [ ] **Step 1: Add table to schema**

```typescript
export const stravaBikes = sqliteTable(
  "strava_bikes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuid()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stravaGearId: text("strava_gear_id").notNull(),
    bikeId: text("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "cascade" }),
    linkedAt: integer("linked_at").notNull().$defaultFn(nowMs),
    componentCreditFrom: text("component_credit_from").notNull(), // YYYY-MM-DD
  },
  (t) => [
    uniqueIndex("idx_strava_bikes_user_gear").on(t.userId, t.stravaGearId),
    uniqueIndex("idx_strava_bikes_user_bike").on(t.userId, t.bikeId),
    index("idx_strava_bikes_bike").on(t.bikeId),
  ],
);
```

- [ ] **Step 2: Generate and apply migration**

Run: `npm run -w server db:generate && npm run -w server db:migrate`

- [ ] **Step 3: Backfill in migration SQL or script**

For each `bikes` row where `strava_gear_id IS NOT NULL`:

```sql
INSERT INTO strava_bikes (id, user_id, strava_gear_id, bike_id, linked_at, component_credit_from)
SELECT lower(hex(randomblob(16))), user_id, strava_gear_id, id, updated_at,
       date(updated_at / 1000, 'unixepoch')
FROM bikes WHERE strava_gear_id IS NOT NULL;
```

(Use proper UUID generation in a TS script if preferred.)

- [ ] **Step 4: Commit**

```bash
git add server/src/db/schema.ts server/src/db/relations.ts server/drizzle
git commit -m "feat(db): add strava_bikes link table with component credit cutoff"
```

---

### Task 2: Baseline migration script + tests

**Files:**

- Create: `server/src/lib/wear-baseline.ts`
- Create: `server/src/test/wear-baseline.test.ts`
- Create: `server/scripts/migrate-wear-baseline.ts`

- [ ] **Step 1: Write failing test for split logic**

```typescript
import { describe, expect, it } from "vite-plus/test";
import { computeBaseline } from "../lib/wear-baseline.js";

describe("computeBaseline", () => {
  it("returns stored minus strava wear floored at zero", () => {
    expect(computeBaseline(600, 500)).toBe(100);
    expect(computeBaseline(500, 500)).toBe(0);
    expect(computeBaseline(100, 500)).toBe(0);
    expect(computeBaseline(null, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
export function computeBaseline(
  stored: number | null | undefined,
  stravaWear: number,
): number | null {
  const base = Math.max(0, (stored ?? 0) - stravaWear);
  return base === 0 ? null : base;
}
```

- [ ] **Step 3: Script iterates components, sums junction, updates baseline**

Run script once after deploy: `npx tsx server/scripts/migrate-wear-baseline.ts`

- [ ] **Step 4: Run tests, commit**

---

### Task 3: Rewrite `processActivity` (TDD)

**Files:**

- Modify: `server/src/routes/strava.ts`
- Modify: `server/src/test/strava.test.ts`

- [ ] **Step 1: Update test — sync must NOT increment component distance**

Change assertion in `credits linked active components only once`:

```typescript
// After sync, junction rows exist but baseline unchanged
expect(detail.body.components[0].distanceMeters).toBe(0); // was 2000
// Add query: junction sum = 2000
```

- [ ] **Step 2: Add test — activity before credit cutoff skips junction**

Setup `strava_bikes` with `component_credit_from = '2026-07-01'`, activity `start_date = '2026-06-01'` → activity row yes, junction count 0.

- [ ] **Step 3: Implement processActivity**

- Resolve bike via `strava_bikes` first, fallback `bikes.stravaGearId`
- Load `componentCreditFrom` from `strava_bikes`
- Compare `activity.startDate` (date part) to cutoff
- Remove `tx.update(components)` increment block
- Keep junction inserts when after cutoff

- [ ] **Step 4: Import/commit creates `strava_bikes` row**

On link/create bike:

```typescript
const today = new Date().toISOString().slice(0, 10);
const creditFrom = data.creditHistoricalComponents ? "1970-01-01" : today;
// upsert strava_bikes with componentCreditFrom: creditFrom
```

- [ ] **Step 5: Run strava tests, commit**

---

### Task 4: Stats API — junction + baseline

**Files:**

- Modify: `server/src/routes/stats.ts`
- Modify: `server/src/test/stats.test.ts`

- [ ] **Step 1: Add helper `getComponentWear(userId, bikeId)`**

```typescript
// Per component: strava from junction, baseline from components, display = sum
const junctionSums = db.select({
  componentId: stravaActivityComponents.componentId,
  distanceMeters: sql`coalesce(sum(${stravaActivityComponents.distanceMeters}), 0)`,
  movingTimeMinutes: sql`coalesce(sum(${stravaActivityComponents.movingTimeMinutes}), 0)`,
}).from(stravaActivityComponents)
  .innerJoin(stravaActivities, eq(...))
  .where(eq(stravaActivities.bikeId, bikeId))
  .groupBy(stravaActivityComponents.componentId)
  .all();
```

Return `displayDistanceMeters = junction + coalesce(baseline, 0)` in `bikeStats.components`.

- [ ] **Step 2: Update stats tests** — insert junction rows, baseline separate, assert display total

- [ ] **Step 3: Client** — no schema change if API shape keeps `distanceMeters` as **display total** on stats endpoint; document in shared types as `displayDistanceMeters` optional clarity

- [ ] **Step 4: Commit**

---

### Task 5: Component form + shared validation

**Files:**

- Modify: `client/src/features/components/ComponentForm.tsx`
- Modify: `shared/src/schemas/component.ts`

- [ ] **Step 1: Labels** — “Starting distance (km)”, helper text about Strava activities

- [ ] **Step 2: Zod** — `.min(0)` on distance/moving time when present (already optionalInt ≥ 0)

- [ ] **Step 3: Bike detail / nav** — stats still work via stats API (display total); component rows on bike detail show baseline + need stats hook OR show display from stats endpoint

**Note:** `GET /api/bikes/:id` still returns raw baseline in `components`. UI showing wear should prefer `useBikeStats` display totals. Update `CategoryDetailContent` / `ComponentsNav` to use stats display fields if available, or add computed display to bike detail API (pick one — prefer stats hook already used on Overview).

- [ ] **Step 4: Commit**

---

### Task 6: Import UI — historical credit opt-in

**Files:**

- Modify: `shared/src/schemas/strava.ts`
- Modify: `client/src/routes/integrations.tsx`
- Modify: `server/src/routes/strava.ts`

- [ ] **Step 1: Add optional `creditHistoricalComponents: z.boolean().default(false)` to import commit schema**

- [ ] **Step 2: Checkbox in import dialog** — “Credit past rides to current components” default unchecked

- [ ] **Step 3: Wire to import/commit handler**

- [ ] **Step 4: Commit**

---

### Task 7: Phase 1 verification

- [ ] Run `npm run -w shared build && vp check && npm test`
- [ ] Manual: sync ride → junction rows created, baseline unchanged, UI totals correct
- [ ] Run baseline migration script on dev DB if existing data

---

# Phase 2 (separate PR recommended)

### Task 8: Activity schemas + routes

**Files:**

- Create: `shared/src/schemas/activity.ts`
- Create: `server/src/routes/activities.ts`

- [ ] **GET `/api/bikes/:bikeId/activities`** — cursor/page, `{ id, startDate, distanceMeters, movingTimeMinutes, componentIds[], componentNames[] }`

- [ ] **GET `/api/activities/:id`**

- [ ] **PATCH `/api/activities/:id`** — body `{ distanceMeters?, movingTimeMinutes?, componentIds: string[] }`; replace junction rows; validate components on same bike

- [ ] **Tests** for auth, ownership, component validation, junction replace

---

### Task 9: Activities UI

**Files:**

- Create: `client/src/features/activities/api.ts`, `ActivityList.tsx`, `EditActivityDialog.tsx`
- Modify: `client/src/routes/bike-detail.tsx`

- [ ] **Activities tab** — table of rides, edit opens dialog
- [ ] **Component picker** — all components on bike (grouped by category), multi-select
- [ ] **Invalidate** stats + activities on save

---

### Task 10: Phase 2 verification

- [ ] Full test suite + manual edit flow (change distance, swap linked chain)

---

## Spec coverage

| Spec requirement          | Task |
| ------------------------- | ---- |
| strava_bikes table        | 1    |
| Baseline migration        | 2    |
| No sync increment         | 3    |
| component_credit_from     | 3    |
| Stats junction + baseline | 4    |
| Form baseline labels      | 5    |
| Historical credit opt-in  | 6    |
| Activity list/edit        | 8–9  |
| Any component on edit     | 8    |
| Positive baseline only    | 5    |

## Execution note

Phase 1 should ship before Phase 2. Phase 1 changes sync semantics — run baseline migration script once after deploy.

---

**Plan complete.** Recommended: implement Phase 1 first via subagent-driven or inline execution; Phase 2 as follow-up PR.
