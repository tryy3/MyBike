# Strava Stats Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Strava-synced distance and moving time on the home list, component rows, and bike Overview tab via a dedicated `/api/stats` API.

**Architecture:** Server aggregates true ride totals from `strava_activities` (avoiding component over-counting) and returns component wear from the `components` table. Client fetches stats in parallel with existing bike queries, uses shared formatters, and invalidates stats caches after Strava sync/import.

**Tech stack:** Express + Drizzle + SQLite (server), Zod schemas (`shared`), React + TanStack Query + shadcn (client), Vitest via `vite-plus/test`.

**Spec:** `docs/superpowers/specs/2026-07-05-strava-stats-display-design.md`

---

## File map

| File                                                       | Responsibility                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `shared/src/schemas/stats.ts`                              | Zod schemas + types for stats API responses                         |
| `server/src/routes/stats.ts`                               | `GET /api/stats/garage`, `GET /api/stats/bikes/:bikeId`             |
| `server/src/test/stats.test.ts`                            | Stats endpoint tests                                                |
| `client/src/lib/format-stats.ts`                           | `formatDistance`, `formatMovingTime`, `formatStatsLine`, `hasStats` |
| `client/src/features/stats/api.ts`                         | `useGarageStats`, `useBikeStats` hooks                              |
| `client/src/features/stats/ComponentStats.tsx`             | Reusable wear display (future badge slot)                           |
| `client/src/lib/api.ts`                                    | API methods + query keys                                            |
| `client/src/routes/bikes-list.tsx`                         | Home mileage column                                                 |
| `client/src/routes/bike-detail.tsx`                        | Overview ride summary + wear list                                   |
| `client/src/features/components/CategoryDetailContent.tsx` | Component row stats                                                 |
| `client/src/routes/integrations.tsx`                       | Import shared formatters                                            |
| `client/src/features/strava/api.ts`                        | Invalidate stats on sync/import                                     |

---

### Task 1: Shared stats schemas

**Files:**

- Create: `shared/src/schemas/stats.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Create `shared/src/schemas/stats.ts`**

```typescript
import { z } from "zod";

export const rideStatsSchema = z.object({
  distanceMeters: z.number().int().min(0),
  movingTimeMinutes: z.number().int().min(0),
  activityCount: z.number().int().min(0),
});

export const componentWearSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  distanceMeters: z.number().int().min(0).nullable(),
  movingTimeMinutes: z.number().int().min(0).nullable(),
  isActive: z.boolean(),
});

export const garageBikeStatsSchema = z.object({
  bikeId: z.string().uuid(),
  rideStats: rideStatsSchema.nullable(),
});

export const garageStatsSchema = z.object({
  bikes: z.array(garageBikeStatsSchema),
});

export const bikeStatsSchema = z.object({
  bikeId: z.string().uuid(),
  rideStats: rideStatsSchema.nullable(),
  components: z.array(componentWearSchema),
});

export type RideStats = z.infer<typeof rideStatsSchema>;
export type ComponentWear = z.infer<typeof componentWearSchema>;
export type GarageStats = z.infer<typeof garageStatsSchema>;
export type BikeStats = z.infer<typeof bikeStatsSchema>;
```

- [ ] **Step 2: Export from `shared/src/index.ts`**

Add after the strava export line:

```typescript
export * from "./schemas/stats.js";
```

- [ ] **Step 3: Build shared**

Run: `npm run -w shared build`  
Expected: succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add shared/src/schemas/stats.ts shared/src/index.ts
git commit -m "feat(shared): add stats API schemas for ride and component wear"
```

---

### Task 2: Stats API — garage endpoint (TDD)

**Files:**

- Create: `server/src/test/stats.test.ts`
- Create: `server/src/routes/stats.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write failing garage stats test**

Create `server/src/test/stats.test.ts`:

```typescript
import { describe, expect, it } from "vite-plus/test";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import { db } from "../db/index.js";
import { account, user } from "../db/auth-schema.js";
import { stravaActivities } from "../db/schema.js";

const app = createApp();

async function connectStravaAccount(email: string) {
  const currentUser = db.select().from(user).where(eq(user.email, email)).get();
  expect(currentUser).toBeDefined();
  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      accountId: "strava-athlete-1",
      providerId: "strava",
      userId: currentUser!.id,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: "read,activity:read_all,profile:read_all",
    })
    .run();
}

describe("GET /api/stats/garage", () => {
  it("returns 401 when unauthenticated", async () => {
    await request(app).get("/api/stats/garage").expect(401);
  });

  it("returns rideStats per bike aggregated from strava_activities", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bikeA = await agent.post("/api/bikes").send({ name: "Road" }).expect(201);
    const bikeB = await agent.post("/api/bikes").send({ name: "Gravel" }).expect(201);

    db.insert(stravaActivities)
      .values([
        {
          userId: testUser.id,
          bikeId: bikeA.body.id,
          stravaActivityId: "act-1",
          stravaGearId: "gear-a",
          distanceMeters: 10000,
          movingTimeMinutes: 30,
          startDate: "2026-07-01T10:00:00Z",
        },
        {
          userId: testUser.id,
          bikeId: bikeA.body.id,
          stravaActivityId: "act-2",
          stravaGearId: "gear-a",
          distanceMeters: 5000,
          movingTimeMinutes: 15,
          startDate: "2026-07-02T10:00:00Z",
        },
      ])
      .run();

    const res = await agent.get("/api/stats/garage").expect(200);

    const road = res.body.bikes.find((b: { bikeId: string }) => b.bikeId === bikeA.body.id);
    const gravel = res.body.bikes.find((b: { bikeId: string }) => b.bikeId === bikeB.body.id);

    expect(road.rideStats).toEqual({
      distanceMeters: 15000,
      movingTimeMinutes: 45,
      activityCount: 2,
    });
    expect(gravel.rideStats).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w server test -- stats.test.ts`  
Expected: FAIL (404 — route not mounted)

- [ ] **Step 3: Implement stats router (garage only)**

Create `server/src/routes/stats.ts`:

```typescript
import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { GarageStats } from "shared";
import { db } from "../db/index.js";
import { bikes, stravaActivities } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { getAuthContext, requireAuth } from "../lib/require-auth.js";
import { parseParams } from "../lib/validation.js";

const statsRouter = Router();
statsRouter.use(requireAuth);

const bikeIdParamsSchema = z.object({ bikeId: z.string().uuid() });

function aggregateRideStats(userId: string, bikeIds: string[]) {
  if (bikeIds.length === 0) return new Map<string, GarageStats["bikes"][number]["rideStats"]>();

  const rows = db
    .select({
      bikeId: stravaActivities.bikeId,
      distanceMeters: sql<number>`coalesce(sum(${stravaActivities.distanceMeters}), 0)`.as(
        "distance_meters",
      ),
      movingTimeMinutes: sql<number>`coalesce(sum(${stravaActivities.movingTimeMinutes}), 0)`.as(
        "moving_time_minutes",
      ),
      activityCount: sql<number>`count(*)`.as("activity_count"),
    })
    .from(stravaActivities)
    .where(and(eq(stravaActivities.userId, userId), inArray(stravaActivities.bikeId, bikeIds)))
    .groupBy(stravaActivities.bikeId)
    .all();

  return new Map(
    rows.map((row) => [
      row.bikeId,
      {
        distanceMeters: Number(row.distanceMeters),
        movingTimeMinutes: Number(row.movingTimeMinutes),
        activityCount: Number(row.activityCount),
      },
    ]),
  );
}

statsRouter.get("/garage", (req, res) => {
  const { userId } = getAuthContext(req);
  const userBikes = db.select({ id: bikes.id }).from(bikes).where(eq(bikes.userId, userId)).all();
  const bikeIds = userBikes.map((b) => b.id);
  const statsByBike = aggregateRideStats(userId, bikeIds);

  const payload: GarageStats = {
    bikes: bikeIds.map((bikeId) => ({
      bikeId,
      rideStats: statsByBike.get(bikeId) ?? null,
    })),
  };

  res.json(payload);
});

function requireBike(bikeId: string, userId: string) {
  const bike = db
    .select({ id: bikes.id })
    .from(bikes)
    .where(and(eq(bikes.id, bikeId), eq(bikes.userId, userId)))
    .get();
  if (!bike) throw notFound("Bike");
  return bike;
}

statsRouter.get("/bikes/:bikeId", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, bikeIdParamsSchema);
  requireBike(bikeId, userId);
  res.status(501).json({ error: "Not implemented" });
});

export default statsRouter;
```

Mount in `server/src/app.ts`:

```typescript
import statsRouter from "./routes/stats.js";
// ...
app.use("/api/stats", statsRouter);
```

- [ ] **Step 4: Run garage test**

Run: `npm run -w server test -- stats.test.ts`  
Expected: garage test PASS; bike stats test not yet written

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/stats.ts server/src/app.ts server/src/test/stats.test.ts
git commit -m "feat(server): add GET /api/stats/garage ride aggregation"
```

---

### Task 3: Stats API — bike endpoint (TDD)

**Files:**

- Modify: `server/src/routes/stats.ts`
- Modify: `server/src/test/stats.test.ts`

- [ ] **Step 1: Add failing bike stats tests**

Append to `server/src/test/stats.test.ts`:

```typescript
describe("GET /api/stats/bikes/:bikeId", () => {
  it("returns 401 when unauthenticated", async () => {
    await request(app).get("/api/stats/bikes/00000000-0000-4000-8000-000000000001").expect(401);
  });

  it("returns 404 for another user's bike", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { agent: agentB } = await createAuthenticatedAgent(app);
    const bike = await agentA.post("/api/bikes").send({ name: "Private" }).expect(201);
    await agentB.get(`/api/stats/bikes/${bike.body.id}`).expect(404);
  });

  it("returns rideStats and components sorted by distance desc", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Wear Test" }).expect(201);
    const bikeId = bike.body.id;

    await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send({
        category: "chain",
        name: "Chain",
        brand: "Shimano",
        model: "HG701",
        distanceMeters: 5000,
        movingTimeMinutes: 120,
      })
      .expect(201);

    await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send({
        category: "tires_front",
        name: "Front tire",
        brand: "Continental",
        model: "GP5000",
        distanceMeters: 12000,
        movingTimeMinutes: 300,
      })
      .expect(201);

    const res = await agent.get(`/api/stats/bikes/${bikeId}`).expect(200);

    expect(res.body.bikeId).toBe(bikeId);
    expect(res.body.rideStats).toBeNull();
    expect(res.body.components).toHaveLength(2);
    expect(res.body.components[0].distanceMeters).toBe(12000);
    expect(res.body.components[1].distanceMeters).toBe(5000);
  });
});
```

- [ ] **Step 2: Run tests to verify bike test fails**

Run: `npm run -w server test -- stats.test.ts`  
Expected: bike stats test FAIL (501)

- [ ] **Step 3: Implement bike stats handler**

In `server/src/routes/stats.ts`, add imports and replace the 501 stub:

```typescript
import { asc, desc, sql } from "drizzle-orm";
import type { BikeStats } from "shared";
import { components } from "../db/schema.js";

// Replace statsRouter.get("/bikes/:bikeId", ...) with:
statsRouter.get("/bikes/:bikeId", (req, res) => {
  const { userId } = getAuthContext(req);
  const { bikeId } = parseParams(req, bikeIdParamsSchema);
  requireBike(bikeId, userId);

  const rideStatsMap = aggregateRideStats(userId, [bikeId]);
  const rideStats = rideStatsMap.get(bikeId) ?? null;

  const componentRows = db
    .select({
      id: components.id,
      category: components.category,
      name: components.name,
      brand: components.brand,
      model: components.model,
      distanceMeters: components.distanceMeters,
      movingTimeMinutes: components.movingTimeMinutes,
      isActive: components.isActive,
    })
    .from(components)
    .where(eq(components.bikeId, bikeId))
    .orderBy(
      desc(sql`coalesce(${components.distanceMeters}, 0)`),
      asc(components.sortOrder),
      asc(components.createdAt),
    )
    .all();

  const payload: BikeStats = {
    bikeId,
    rideStats,
    components: componentRows,
  };

  res.json(payload);
});
```

- [ ] **Step 4: Run all stats tests**

Run: `npm run -w server test -- stats.test.ts`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/stats.ts server/src/test/stats.test.ts
git commit -m "feat(server): add GET /api/stats/bikes/:bikeId with component wear"
```

---

### Task 4: Shared formatters

**Files:**

- Create: `client/src/lib/format-stats.ts`
- Modify: `client/src/routes/integrations.tsx`

- [ ] **Step 1: Create `client/src/lib/format-stats.ts`**

```typescript
export function formatDistance(meters: number): string {
  return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
}

export function formatMovingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

export function hasStats(
  distanceMeters: number | null | undefined,
  movingTimeMinutes: number | null | undefined,
): boolean {
  return (distanceMeters ?? 0) > 0 || (movingTimeMinutes ?? 0) > 0;
}

export function formatStatsLine(
  distanceMeters: number | null | undefined,
  movingTimeMinutes: number | null | undefined,
): string {
  if (!hasStats(distanceMeters, movingTimeMinutes)) return "—";
  const parts: string[] = [];
  if ((distanceMeters ?? 0) > 0) parts.push(formatDistance(distanceMeters!));
  if ((movingTimeMinutes ?? 0) > 0) parts.push(formatMovingTime(movingTimeMinutes!));
  return parts.join(" · ");
}
```

- [ ] **Step 2: Update `integrations.tsx`**

Remove local `formatDistance` and `formatMovingTime` functions. Add:

```typescript
import { formatDistance, formatMovingTime } from "@/lib/format-stats";
```

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/format-stats.ts client/src/routes/integrations.tsx
git commit -m "refactor(client): extract shared stats formatters"
```

---

### Task 5: Client API + query hooks

**Files:**

- Modify: `client/src/lib/api.ts`
- Create: `client/src/features/stats/api.ts`

- [ ] **Step 1: Extend `client/src/lib/api.ts`**

Add imports:

```typescript
import type { BikeStats, GarageStats } from "shared";
```

Add to `queryKeys`:

```typescript
garageStats: ["stats", "garage"] as const,
bikeStats: (id: string) => ["stats", "bike", id] as const,
```

Add to `api` object:

```typescript
getGarageStats: () => apiFetch<GarageStats>("/api/stats/garage"),
getBikeStats: (bikeId: string) => apiFetch<BikeStats>(`/api/stats/bikes/${bikeId}`),
```

- [ ] **Step 2: Create `client/src/features/stats/api.ts`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";

export function useGarageStats() {
  return useQuery({
    queryKey: queryKeys.garageStats,
    queryFn: () => api.getGarageStats(),
  });
}

export function useBikeStats(bikeId: string) {
  return useQuery({
    queryKey: queryKeys.bikeStats(bikeId),
    queryFn: () => api.getBikeStats(bikeId),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/api.ts client/src/features/stats/api.ts
git commit -m "feat(client): add stats API client and query hooks"
```

---

### Task 6: ComponentStats component + component rows

**Files:**

- Create: `client/src/features/stats/ComponentStats.tsx`
- Modify: `client/src/features/components/CategoryDetailContent.tsx`

- [ ] **Step 1: Create `ComponentStats.tsx`**

```tsx
import { formatStatsLine } from "@/lib/format-stats";
import { cn } from "@/lib/utils";

interface ComponentStatsProps {
  distanceMeters: number | null | undefined;
  movingTimeMinutes: number | null | undefined;
  className?: string;
}

export function ComponentStats({
  distanceMeters,
  movingTimeMinutes,
  className,
}: ComponentStatsProps) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatStatsLine(distanceMeters, movingTimeMinutes)}
    </span>
  );
}
```

- [ ] **Step 2: Add stats to `ComponentRow` in `CategoryDetailContent.tsx`**

Import:

```typescript
import { ComponentStats } from "@/features/stats/ComponentStats";
```

Inside the name/brand column, after the brand/model `<span>`, add:

```tsx
<ComponentStats
  distanceMeters={component.distanceMeters}
  movingTimeMinutes={component.movingTimeMinutes}
  className="text-xs text-muted-foreground"
/>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/features/stats/ComponentStats.tsx client/src/features/components/CategoryDetailContent.tsx
git commit -m "feat(client): show component wear on component rows"
```

---

### Task 7: Home list mileage column

**Files:**

- Modify: `client/src/routes/bikes-list.tsx`

- [ ] **Step 1: Fetch garage stats and join by bikeId**

Add imports:

```typescript
import { useMemo } from "react";
import { useGarageStats } from "@/features/stats/api";
import { formatStatsLine } from "@/lib/format-stats";
```

In `BikesListPage`:

```typescript
const garageStats = useGarageStats();

const statsByBikeId = useMemo(() => {
  const map = new Map<string, string>();
  for (const entry of garageStats.data?.bikes ?? []) {
    map.set(
      entry.bikeId,
      entry.rideStats
        ? formatStatsLine(entry.rideStats.distanceMeters, entry.rideStats.movingTimeMinutes)
        : "—",
    );
  }
  return map;
}, [garageStats.data]);
```

- [ ] **Step 2: Add table column and mobile subtitle**

In `<TableHeader>`, after Components column:

```tsx
<TableHead className="hidden lg:table-cell text-right">Mileage</TableHead>
```

In each `<TableRow>`, after component count cell:

```tsx
<TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
  {statsByBikeId.get(bike.id) ?? "—"}
</TableCell>
```

Under the year subtitle in the bike name cell, add (mobile only):

```tsx
<span className="text-xs font-normal text-muted-foreground tabular-nums lg:hidden">
  {statsByBikeId.get(bike.id) ?? "—"}
</span>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/bikes-list.tsx
git commit -m "feat(client): show bike mileage on home list"
```

---

### Task 8: Bike Overview tab

**Files:**

- Modify: `client/src/routes/bike-detail.tsx`

- [ ] **Step 1: Fetch bike stats on detail page**

Add imports:

```typescript
import { useBikeStats } from "@/features/stats/api";
import { ComponentStats } from "@/features/stats/ComponentStats";
import { formatDistance, formatMovingTime, hasStats } from "@/lib/format-stats";
import { getCategoryLabel } from "shared"; // or existing category label helper if different
```

In the bike detail component (where `useBike(bikeId)` is called):

```typescript
const bikeStats = useBikeStats(bikeId);
```

Check how category labels are rendered elsewhere — use the same helper (likely from `shared` categories).

- [ ] **Step 2: Replace Overview tab content**

Replace the single overview card with two cards:

**Ride summary card** — when `bikeStats.data?.rideStats` is null, show `—` for all three rows:

```tsx
<OverviewRow label="Total distance">
  {bikeStats.data?.rideStats
    ? formatDistance(bikeStats.data.rideStats.distanceMeters)
    : "—"}
</OverviewRow>
<OverviewRow label="Moving time">
  {bikeStats.data?.rideStats
    ? formatMovingTime(bikeStats.data.rideStats.movingTimeMinutes)
    : "—"}
</OverviewRow>
<OverviewRow label="Rides synced">
  {bikeStats.data?.rideStats?.activityCount ?? "—"}
</OverviewRow>
```

**Component wear card** — filter components:

```typescript
const wearComponents =
  bikeStats.data?.components.filter(
    (c) => c.isActive && hasStats(c.distanceMeters, c.movingTimeMinutes),
  ) ?? [];
```

Render list with category label, name, and `<ComponentStats />`. Empty state copy:

> No component mileage yet — sync Strava or enter usage in a component's edit form.

Show loading state while `bikeStats.isPending` (muted "Loading stats…" in the wear card).

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/bike-detail.tsx
git commit -m "feat(client): add ride summary and component wear to Overview tab"
```

---

### Task 9: Strava query invalidation

**Files:**

- Modify: `client/src/features/strava/api.ts`

- [ ] **Step 1: Invalidate stats and bike detail after sync/import**

In both `useCommitStravaImport` and `useSyncStrava` `onSuccess` handlers, add:

```typescript
void qc.invalidateQueries({ queryKey: queryKeys.garageStats });
void qc.invalidateQueries({ queryKey: ["stats", "bike"] });
void qc.invalidateQueries({ queryKey: queryKeys.bikes });
```

The prefix `["stats", "bike"]` invalidates all `bikeStats(id)` queries.

Optional: also invalidate all open bike details:

```typescript
void qc.invalidateQueries({ queryKey: ["bikes"] });
```

(`queryKeys.bikes` is `["bikes"]` which matches `bike(id)` keys as prefix in TanStack Query v5.)

- [ ] **Step 2: Commit**

```bash
git add client/src/features/strava/api.ts
git commit -m "fix(client): invalidate stats queries after Strava sync/import"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run quality gates**

```bash
npm run -w shared build
vp check
npm test
```

Expected: all pass

- [ ] **Step 2: Manual smoke test**

1. Start server + client dev servers
2. Open a bike with Strava-synced mileage
3. Confirm home list, component rows, and Overview show stats
4. Run Strava sync — stats update without hard refresh

- [ ] **Step 3: Final commit if any fixups needed**

---

## Spec coverage checklist

| Spec requirement               | Task            |
| ------------------------------ | --------------- |
| `GET /api/stats/garage`        | Task 2          |
| `GET /api/stats/bikes/:bikeId` | Task 3          |
| Shared Zod schemas             | Task 1          |
| Home list mileage              | Task 7          |
| Component row wear             | Task 6          |
| Overview ride + wear           | Task 8          |
| Shared formatters              | Task 4          |
| Query invalidation             | Task 9          |
| Server tests                   | Tasks 2–3       |
| Empty state `—`                | Tasks 4, 6–8    |
| No new DB migrations           | ✓ (none needed) |

## Out of scope (do not implement)

- Maintenance thresholds or badges
- Activity history page
- Strava CTAs outside integrations
- Extending bike CRUD responses with stats
