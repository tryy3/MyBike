# Strava Integration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address PR #16 review findings — fix client cache gaps, make sync incremental and rate-limit friendly, harden OAuth/token handling, improve import UX, and clarify historical component credit behavior.

**Architecture:** Ship in six independent phases. Each phase merges on its own. Phase 1 is client-only (zero risk). Phase 2–3 touch `strava-client.ts` and `strava.ts` sync path. Phase 4 adds a small `strava_sync_state` table for `after` timestamps. Phase 5 centralizes token refresh. Phase 6 adds backfill + import UX. Defer webhooks and Strava activity update/delete sync to a follow-up spec.

**Source:** Code review of PR #16 (`cursor/cursor-0f4e`), 2026-07-06.

**Tech stack:** Drizzle + SQLite, Express, shared Zod, TanStack Query, Vitest (`vite-plus/test`), Strava API v3.

---

## Phasing overview

| Phase     | Theme                                 | Est.    | Ships independently |
| --------- | ------------------------------------- | ------- | ------------------- |
| **1**     | Client cache + polish                 | ~30 min | Yes                 |
| **2**     | Activity filtering + safe fallbacks   | ~1 h    | Yes                 |
| **3**     | Incremental sync (`after`)            | ~2 h    | Yes                 |
| **4**     | Token refresh mutex + reconnect       | ~2 h    | Yes                 |
| **5**     | Historical credit backfill + UX       | ~2 h    | Yes                 |
| **6**     | OAuth UX + disconnect + import picker | ~3 h    | Yes                 |
| **Later** | Webhooks, Strava-side updates/deletes | —       | Separate plan       |

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6. Run `npm run verify` after each phase.

---

## File map

| File                                                       | Phases               |
| ---------------------------------------------------------- | -------------------- |
| `client/src/features/strava/api.ts`                        | 1, 6                 |
| `client/src/features/components/api.ts`                    | 1                    |
| `client/src/routes/integrations.tsx`                       | 5, 6                 |
| `client/src/features/components/CategoryDetailContent.tsx` | 1 (optional tooltip) |
| `server/src/lib/strava-client.ts`                          | 2, 3, 4              |
| `server/src/lib/strava-sync-state.ts`                      | 3 (new)              |
| `server/src/lib/strava-token.ts`                           | 4 (new)              |
| `server/src/routes/strava.ts`                              | 2, 3, 4, 5, 6        |
| `server/src/db/schema.ts`                                  | 3                    |
| `server/drizzle/*`                                         | 3                    |
| `shared/src/schemas/strava.ts`                             | 5, 6                 |
| `server/src/test/strava.test.ts`                           | 2, 3, 4, 5           |
| `server/src/test/strava-token.test.ts`                     | 4 (new)              |

---

# Phase 1 — Client cache + polish

Low-risk fixes users feel immediately.

### Task 1: Invalidate activity queries after Strava mutations

**Files:**

- Modify: `client/src/features/strava/api.ts`

- [ ] **Step 1: Add shared invalidation helper**

```typescript
function invalidateStravaDerivedQueries(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.stravaStatus });
  void qc.invalidateQueries({ queryKey: queryKeys.bikes });
  void qc.invalidateQueries({ queryKey: queryKeys.garageStats });
  void qc.invalidateQueries({ queryKey: ["stats", "bike"] });
  void qc.invalidateQueries({ queryKey: ["activities", "bike"] });
}
```

Replace duplicated `onSuccess` bodies in `useCommitStravaImport` and `useSyncStrava` with `invalidateStravaDerivedQueries(qc)`.

- [ ] **Step 2: Manual check**

1. Open bike detail → Activities tab.
2. Sync Strava with a new ride linked to that bike.
3. Confirm activity list updates without full page reload.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/strava/api.ts
git commit -m "fix(client): invalidate activity queries after Strava sync/import"
```

---

### Task 2: Invalidate stats when activating a component

**Files:**

- Modify: `client/src/features/components/api.ts`

- [ ] **Step 1: Use `invalidateComponentQueries` in `useActivateComponent`**

```typescript
export function useActivateComponent(bikeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.activateComponent(id),
    onSuccess: () => invalidateComponentQueries(qc, bikeId),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/features/components/api.ts
git commit -m "fix(client): invalidate stats when activating a component"
```

---

# Phase 2 — Activity filtering + safe fallbacks

### Task 3: Filter non-cycling activities

**Files:**

- Modify: `server/src/lib/strava-client.ts`
- Test: `server/src/test/strava.test.ts`

- [ ] **Step 1: Add cycling sport types constant**

```typescript
const CYCLING_SPORT_TYPES = new Set([
  "Ride",
  "MountainBikeRide",
  "GravelRide",
  "EBikeRide",
  "EMountainBikeRide",
  "Velomobile",
  "Handcycle",
  "VirtualRide",
]);

interface RawStravaActivity {
  // ...existing fields...
  sport_type?: unknown;
  type?: unknown; // deprecated fallback
}
```

- [ ] **Step 2: Write failing test**

```typescript
it("ignores activities that are not cycling sport types", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  await connectStravaAccount(testUser.email);

  mockActivities = [
    {
      id: 1,
      gear_id: "b1",
      sport_type: "Run",
      distance: 5000,
      moving_time: 1800,
      start_date: todayRideDate(),
    },
    {
      id: 2,
      gear_id: "b1",
      sport_type: "Ride",
      distance: 10000,
      moving_time: 3600,
      start_date: todayRideDate(),
    },
  ];

  const preview = await agent.get("/api/strava/import/preview").expect(200);
  expect(preview.body.items).toHaveLength(1);
  expect(preview.body.items[0].distanceMeters).toBe(10000);
});
```

Extend `MockActivity` in the test file with optional `sport_type`.

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run -w server test -- src/test/strava.test.ts -t "not cycling"`

- [ ] **Step 4: Filter in `normalizeActivity`**

```typescript
function isCyclingActivity(raw: RawStravaActivity): boolean {
  const sport =
    typeof raw.sport_type === "string"
      ? raw.sport_type
      : typeof raw.type === "string"
        ? raw.type
        : null;
  if (!sport) return true; // Strava list entries without sport_type: keep (legacy)
  return CYCLING_SPORT_TYPES.has(sport);
}

function normalizeActivity(raw: RawStravaActivity): StravaActivity | null {
  if (!isCyclingActivity(raw)) return null;
  // ...existing logic...
}
```

- [ ] **Step 5: Run test — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/strava-client.ts server/src/test/strava.test.ts
git commit -m "fix(strava): ignore non-cycling activities during import/sync"
```

---

### Task 4: Normalize numeric `gear_id` + safer credit fallback

**Files:**

- Modify: `server/src/lib/strava-client.ts`
- Modify: `server/src/routes/strava.ts`
- Test: `server/src/test/strava.test.ts`

- [ ] **Step 1: Accept numeric gear IDs in `normalizeActivity`**

```typescript
function normalizeGearId(raw: RawStravaActivity): string | null {
  if (typeof raw.gear_id === "string" && raw.gear_id.length > 0) return raw.gear_id;
  if (typeof raw.gear_id === "number") return String(raw.gear_id);
  if (typeof raw.gear?.id === "string") return raw.gear.id;
  if (typeof raw.gear?.id === "number") return String(raw.gear.id);
  return null;
}
```

- [ ] **Step 2: Change `resolveLinkedBike` fallback from `1970-01-01` to today**

In `server/src/routes/strava.ts`, replace:

```typescript
return { bikeId: bike.id, componentCreditFrom: "1970-01-01" };
```

with:

```typescript
return { bikeId: bike.id, componentCreditFrom: todayIsoDate() };
```

Add a one-line comment: legacy `bikes.strava_gear_id` without `strava_bikes` row — credit components from today only.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/strava-client.ts server/src/routes/strava.ts
git commit -m "fix(strava): normalize gear_id types and safe credit fallback"
```

---

# Phase 3 — Incremental sync

### Task 5: `strava_sync_state` table

**Files:**

- Modify: `server/src/db/schema.ts`
- Generate: migration

- [ ] **Step 1: Add table**

```typescript
export const stravaSyncState = sqliteTable("strava_sync_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastSyncedAt: integer("last_synced_at").notNull(), // ms epoch
  updatedAt: integer("updated_at").notNull().$defaultFn(nowMs).$onUpdateFn(nowMs),
});
```

Import `user` from `./auth-schema.js`.

- [ ] **Step 2: Generate + migrate**

Run: `npm run -w server db:generate && npm run -w server db:migrate`

- [ ] **Step 3: Commit**

```bash
git add server/src/db/schema.ts server/drizzle
git commit -m "feat(db): add strava_sync_state for incremental sync"
```

---

### Task 6: `fetchStravaActivities` accepts `after` epoch

**Files:**

- Create: `server/src/lib/strava-sync-state.ts`
- Modify: `server/src/lib/strava-client.ts`
- Modify: `server/src/routes/strava.ts`
- Test: `server/src/test/strava.test.ts`

- [ ] **Step 1: Write failing test for `after` query param**

```typescript
it("passes after timestamp to Strava when incremental sync is configured", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  await connectStravaAccount(testUser.email);

  const dbUser = db.select().from(user).where(eq(user.email, testUser.email)).get();
  db.insert(stravaSyncState)
    .values({
      userId: dbUser!.id,
      lastSyncedAt: Date.parse("2026-07-01T00:00:00Z"),
    })
    .run();

  mockActivities = [];
  await agent.post("/api/strava/sync").expect(200);

  expect(stravaRequestPaths.some((p) => p.includes("after="))).toBe(true);
});
```

Import `stravaSyncState` from schema in test file.

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Add optional `afterSeconds` to fetch**

```typescript
export interface FetchStravaActivitiesOptions {
  afterSeconds?: number;
}

export async function fetchStravaActivities(
  accessToken: string,
  options: FetchStravaActivitiesOptions = {},
): Promise<StravaActivity[]> {
  // inside loop, before fetch:
  if (options.afterSeconds != null && page === 1) {
    url.searchParams.set("after", String(options.afterSeconds));
  }
  // ...
}
```

- [ ] **Step 4: Add sync state helpers**

```typescript
// server/src/lib/strava-sync-state.ts
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { stravaSyncState } from "../db/schema.js";

const INITIAL_SYNC_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000; // 1 year first sync

export function getSyncAfterSeconds(userId: string): number {
  const row = db.select().from(stravaSyncState).where(eq(stravaSyncState.userId, userId)).get();
  const ms = row?.lastSyncedAt ?? Date.now() - INITIAL_SYNC_LOOKBACK_MS;
  return Math.floor(ms / 1000);
}

export function markSyncedNow(userId: string): void {
  const now = Date.now();
  const existing = db
    .select({ userId: stravaSyncState.userId })
    .from(stravaSyncState)
    .where(eq(stravaSyncState.userId, userId))
    .get();
  if (existing) {
    db.update(stravaSyncState)
      .set({ lastSyncedAt: now })
      .where(eq(stravaSyncState.userId, userId))
      .run();
    return;
  }
  db.insert(stravaSyncState).values({ userId, lastSyncedAt: now }).run();
}
```

**Note:** Import/preview still calls `fetchStravaActivities(token)` without `after` (full history for matching). Only `/sync` uses incremental fetch.

- [ ] **Step 5: Wire into `/sync` route**

```typescript
stravaRouter.post("/sync", async (req, res) => {
  const { userId } = getAuthContext(req);
  const token = await getStravaAccessToken(userId);
  const afterSeconds = getSyncAfterSeconds(userId);
  const activities = await fetchStravaActivities(token, { afterSeconds });
  const result = db.transaction((tx) => {
    // ...existing processActivity loop...
  });
  markSyncedNow(userId);
  res.json(result);
});
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `npm run -w server test -- src/test/strava.test.ts`

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/strava-sync-state.ts server/src/lib/strava-client.ts server/src/routes/strava.ts server/src/test/strava.test.ts
git commit -m "feat(strava): incremental sync with after timestamp"
```

---

# Phase 4 — Token refresh mutex + reconnect status

### Task 7: Centralize token access with per-user mutex

**Files:**

- Create: `server/src/lib/strava-token.ts`
- Modify: `server/src/routes/strava.ts`
- Test: `server/src/test/strava-token.test.ts`

- [ ] **Step 1: Extract `getStravaAccessToken` from `strava.ts` into `strava-token.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import { account } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { HttpError } from "./errors.js";
import { refreshStravaAccessToken, STRAVA_PROVIDER_ID } from "./strava-client.js";

const refreshLocks = new Map<string, Promise<string>>();

function findStravaAccount(userId: string) {
  return db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, STRAVA_PROVIDER_ID)))
    .get();
}

export function isStravaConnected(userId: string): boolean {
  return !!findStravaAccount(userId)?.accessToken;
}

async function refreshAndPersist(userId: string, refreshToken: string, scope: string | null) {
  const refreshed = await refreshStravaAccessToken(refreshToken, scope);
  const row = findStravaAccount(userId);
  if (!row) throw new HttpError(409, "Connect Strava before importing rides");
  db.update(account)
    .set({
      accountId: refreshed.athleteId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: new Date(refreshed.expiresAtMs),
      scope: refreshed.scope ?? row.scope,
    })
    .where(eq(account.id, row.id))
    .run();
  return refreshed.accessToken;
}

export async function getStravaAccessToken(userId: string): Promise<string> {
  const row = findStravaAccount(userId);
  if (!row?.accessToken) {
    throw new HttpError(409, "Connect Strava before importing rides");
  }

  const expiresAt =
    row.accessTokenExpiresAt instanceof Date
      ? row.accessTokenExpiresAt.getTime()
      : Number(row.accessTokenExpiresAt ?? 0);

  if (!row.refreshToken || expiresAt - Date.now() > 60_000) {
    return row.accessToken;
  }

  const pending = refreshLocks.get(userId);
  if (pending) return pending;

  const refreshPromise = refreshAndPersist(userId, row.refreshToken, row.scope).finally(() => {
    refreshLocks.delete(userId);
  });
  refreshLocks.set(userId, refreshPromise);
  return refreshPromise;
}
```

- [ ] **Step 2: Update `strava.ts` imports** — remove local `getStravaAccessToken`, import from `./strava-token.js`.

- [ ] **Step 3: Extend status schema**

In `shared/src/schemas/strava.ts`:

```typescript
export const stravaStatusSchema = z.object({
  connected: z.boolean(),
  linkedBikes: z.number().int().min(0),
  needsReconnect: z.boolean().optional(),
});
```

Set `needsReconnect: true` in `/status` when account exists but `accessToken` is null (future: after failed refresh). For now, always `false` unless you add refresh-failure tracking in Task 7 step 4.

- [ ] **Step 4: Map 401 from Strava to reconnect hint**

In `strava-client.ts` `fetchJson`, keep 401 mapping. In route handlers, catch `HttpError` 401 and rethrow as 409 with message `"Strava session expired — reconnect in Integrations"`.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/strava-token.ts server/src/routes/strava.ts shared/src/schemas/strava.ts
git commit -m "feat(strava): serialize token refresh and surface reconnect status"
```

---

### Task 8: Basic 429 backoff (single retry)

**Files:**

- Modify: `server/src/lib/strava-client.ts`

- [ ] **Step 1: Retry once on 429 with 2s delay**

```typescript
async function fetchJson(url: URL | string, init: RequestInit, attempt = 0): Promise<unknown> {
  // ...existing fetch...
  if (res.status === 429 && attempt < 1) {
    await new Promise((r) => setTimeout(r, 2000));
    return fetchJson(url, init, attempt + 1);
  }
  // ...existing error handling...
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/lib/strava-client.ts
git commit -m "fix(strava): retry once on 429 rate limit"
```

---

# Phase 5 — Historical credit backfill + UX

### Task 9: Backfill junction rows for stored activities

**Files:**

- Modify: `server/src/routes/strava.ts`
- Modify: `shared/src/schemas/strava.ts`
- Test: `server/src/test/strava.test.ts`

**Behavior:** New endpoint `POST /api/strava/backfill-components` (auth required). For each linked `strava_bikes` row, find `strava_activities` on that bike with `start_date >= component_credit_from` that have **no** junction rows, and insert junction rows for currently active components (same distance/time as activity). Idempotent.

- [ ] **Step 1: Write failing test**

```typescript
it("backfills component links for activities imported without historical credit", async () => {
  const { agent, user: testUser } = await createAuthenticatedAgent(app);
  await connectStravaAccount(testUser.email);

  const bike = await agent.post("/api/bikes").send({ name: "Backfill Bike" }).expect(201);
  await agent.post(`/api/bikes/${bike.body.id}/components`).send(componentPayload()).expect(201);

  mockActivities = [
    {
      id: 200,
      gear_id: "bf-1",
      sport_type: "Ride",
      distance: 3000,
      moving_time: 900,
      start_date: todayRideDate(),
    },
  ];
  mockAthleteBikes = [{ id: "bf-1", name: "Backfill Bike" }];

  await agent
    .post("/api/strava/import/commit")
    .send({
      decisions: [{ gearId: "bf-1", action: "link", bikeId: bike.body.id }],
      creditHistoricalComponents: false,
    })
    .expect(200);

  let stats = await agent.get(`/api/stats/bikes/${bike.body.id}`).expect(200);
  expect(stats.body.components[0].distanceMeters).toBe(0);

  await agent.post("/api/strava/backfill-components").expect(200);

  stats = await agent.get(`/api/stats/bikes/${bike.body.id}`).expect(200);
  expect(stats.body.components[0].distanceMeters).toBe(3000);
});
```

- [ ] **Step 2: Implement `backfillComponentCredits(tx, userId)`**

Query pattern:

```sql
-- activities on user's linked bikes, on/after credit_from, zero junction rows
```

For each, run same junction insert loop as `processActivity` (reuse extracted helper `creditActivityToActiveComponents`).

- [ ] **Step 3: Add route**

```typescript
stravaRouter.post("/backfill-components", (req, res) => {
  const { userId } = getAuthContext(req);
  const credited = db.transaction((tx) => backfillComponentCredits(tx, userId));
  res.json({ creditedActivities: credited });
});
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/strava.ts shared/src/schemas/strava.ts server/src/test/strava.test.ts
git commit -m "feat(strava): backfill component credits for stored activities"
```

---

### Task 10: Import dialog UX — clarify historical credit

**Files:**

- Modify: `client/src/routes/integrations.tsx`

- [ ] **Step 1: Update checkbox helper text**

Replace the muted description with:

> Off by default. When unchecked, rides are saved for bike totals but not linked to components. You can run **Backfill component credits** later from this page after adding components. When checked, all imported rides credit current active components.

- [ ] **Step 2: Add "Backfill component credits" button** (visible when `connected && linkedBikes > 0`)

Wire to new `useBackfillStravaComponents` mutation → `POST /api/strava/backfill-components`. Invalidate same queries as sync.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/integrations.tsx client/src/features/strava/api.ts client/src/lib/api.ts
git commit -m "feat(integrations): backfill button and clearer historical credit copy"
```

---

# Phase 6 — OAuth UX + disconnect + import picker

### Task 11: Disconnect Strava

**Files:**

- Modify: `server/src/routes/strava.ts`
- Modify: `server/src/lib/strava-client.ts`
- Modify: `client/src/features/strava/api.ts`
- Modify: `client/src/routes/integrations.tsx`

- [ ] **Step 1: Add `revokeStravaAccessToken` in strava-client**

```typescript
export async function revokeStravaAccessToken(accessToken: string): Promise<void> {
  const { clientId, clientSecret } = requireStravaCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  await fetch("https://www.strava.com/oauth/deauthorize", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ access_token: accessToken }),
  });
  // Ignore 404/401 — still delete local tokens
}
```

(Verify against current Strava revoke docs; use `deauthorize` or `revoke` per skill reference.)

- [ ] **Step 2: Add `POST /api/strava/disconnect`**

Delete `account` row where `providerId = strava` and `userId`. Optionally keep `strava_activities` (user data). Do **not** delete linked bikes.

- [ ] **Step 3: UI — "Disconnect" button** next to Reconnect when connected. Confirm dialog.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(strava): disconnect endpoint and integrations UI"
```

---

### Task 12: OAuth callback hardening

**Files:**

- Modify: `server/src/routes/strava.ts`

- [ ] **Step 1: Handle `error=access_denied`**

```typescript
if (req.query.error === "access_denied") {
  res.redirect(`${clientUrl}/settings/integrations?strava=denied`);
  return;
}
```

Show toast on integrations page when `strava=denied` query param present.

- [ ] **Step 2: Add `Secure` flag to state cookie in production**

```typescript
const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
res.setHeader(
  "Set-Cookie",
  `${OAUTH_STATE_COOKIE}=...; HttpOnly; SameSite=Lax; Path=/api/strava; Max-Age=600${secure}`,
);
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(strava): OAuth denial redirect and secure state cookie"
```

---

### Task 13: Import — pick any bike when linking

**Files:**

- Modify: `client/src/routes/integrations.tsx`
- Modify: `shared/src/schemas/strava.ts` (link action already has `bikeId`)
- Modify: `client/src/lib/api.ts` — fetch bikes list in import dialog

- [ ] **Step 1: When action is `link`, show Select of all user bikes** (not only matched bike). Default selection = `matchedBikeId`.

- [ ] **Step 2: Send chosen `bikeId` in commit payload**

```typescript
if (action === "link") {
  return {
    gearId: item.gearId,
    action,
    bikeId: selectedBikeIds[item.gearId] ?? item.matchedBikeId,
  };
}
```

Validate server-side: bike belongs to user (already done).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(integrations): bike picker for Strava link import"
```

---

### Task 14: Strava login → integrations connected state

**Files:**

- Modify: `client/src/routes/integrations.tsx`
- Modify: `README.md` (one sentence)

- [ ] **Step 1: When `useStravaStatus().connected`, hide redundant "Connect" emphasis** — show "Connected via Strava login" if account exists from better-auth without separate connect.

No server change needed if `findStravaAccount` already returns true for login users.

- [ ] **Step 2: Document in README** that Strava login and integrations share the same token store.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: clarify Strava login shares integrations connection"
```

---

# Phase 7 — Deferred (separate plan)

Track in `docs/superpowers/specs/2026-07-06-strava-webhooks-design.md` when ready:

| Item                                              | Why defer                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Strava webhooks for activity create/update/delete | Larger infra (subscription, callback URL, async worker)                |
| Unique `(provider_id, account_id)` on account     | Needs better-auth migration + account-merge policy                     |
| Import commit TOCTOU (re-fetch in transaction)    | Lower risk; preview is advisory                                        |
| Per-component distance split on sync              | Product decision; current full-credit model is spec'd                  |
| `MAX_ACTIVITY_PAGES` cap for import preview       | Incremental sync fixes daily use; full import may need paging UI later |

---

## Verification checklist (every phase)

```bash
npm run -w shared build
npm run -w server test
npm test
vp check
```

Manual smoke:

1. Register → Integrations → Connect Strava → Preview import → Commit with/without historical credit.
2. Sync now → bike stats + activity list update without reload.
3. Edit activity → component wear updates in stats.
4. Disconnect → status shows not connected; sync returns 409.

---

## Spec coverage self-review

| Review finding                         | Task             |
| -------------------------------------- | ---------------- |
| Activity list stale after sync         | Task 1           |
| Full re-fetch / rate limits            | Tasks 5–6, 8     |
| Historical credit can't be retrofitted | Tasks 9–10       |
| No sport_type filter                   | Task 3           |
| Token refresh race                     | Task 7           |
| No disconnect                          | Task 11          |
| Dual OAuth confusion                   | Task 14          |
| `1970-01-01` fallback                  | Task 4           |
| Import bike picker                     | Task 13          |
| OAuth callback edge cases              | Task 12          |
| `useActivateComponent` cache           | Task 2           |
| Webhooks / Strava updates              | Phase 7 deferred |

---

## Execution handoff

**Plan saved to `docs/superpowers/plans/2026-07-06-strava-integration-hardening.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per phase/task, review between phases, fast iteration. Use `superpowers:subagent-driven-development`.

2. **Inline Execution** — Implement phases sequentially in this session with checkpoints after each phase. Use `superpowers:executing-plans`.

**Which approach do you want?**
