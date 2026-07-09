import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { account, user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { components, stravaSyncState } from "../db/schema.js";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import {
  createBikeViaGraphql,
  createComponentViaGraphql,
  getBikeViaGraphql,
} from "./graphql-helper.js";

const app = createApp();

interface MockBike {
  id: string;
  name: string;
  primary?: boolean;
  distance?: number;
}

interface MockActivity {
  id: number;
  gear_id: string | null;
  sport_type?: string;
  gear?: {
    id: string;
    name: string;
  } | null;
  distance: number;
  moving_time: number;
  start_date: string;
}

const originalFetch = globalThis.fetch;
let mockActivities: MockActivity[] = [];
let mockAthleteBikes: MockBike[] = [];
let mockGearNames = new Map<string, string>();
let stravaRequestPaths: string[] = [];

function stravaFetchMock(input: RequestInfo | URL): Response | Promise<Response> {
  const requestUrl =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(requestUrl);
  if (url.hostname !== "www.strava.com") {
    throw new Error(`Unexpected Strava request: ${url.toString()}`);
  }

  stravaRequestPaths.push(`${url.pathname}${url.search}`);

  if (url.pathname === "/api/v3/athlete") {
    return new Response(JSON.stringify({ bikes: mockAthleteBikes }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const gearMatch = url.pathname.match(/^\/api\/v3\/gear\/(.+)$/);
  if (gearMatch) {
    const gearId = gearMatch[1]!;
    const name = mockGearNames.get(gearId) ?? null;
    return new Response(JSON.stringify(name ? { id: gearId, name } : {}), {
      status: name ? 200 : 404,
      headers: { "content-type": "application/json" },
    });
  }

  if (url.pathname.endsWith("/athlete/activities")) {
    const page = Number(url.searchParams.get("page") ?? "1");
    const perPage = Number(url.searchParams.get("per_page") ?? "200");
    const after = Number(url.searchParams.get("after") ?? "0");
    let filtered = mockActivities;
    if (after > 0) {
      filtered = mockActivities.filter(
        (activity) => Math.floor(Date.parse(activity.start_date) / 1000) > after,
      );
    }
    const start = (page - 1) * perPage;
    const body = filtered.slice(start, start + perPage);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  throw new Error(`Unexpected Strava request: ${url.toString()}`);
}

beforeEach(() => {
  mockActivities = [];
  mockAthleteBikes = [];
  mockGearNames = new Map();
  stravaRequestPaths = [];
  globalThis.fetch = async (input: RequestInfo | URL) => stravaFetchMock(input);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function componentPayload(overrides: Record<string, unknown> = {}) {
  return { category: "chain", name: "Chain", brand: "Shimano", model: "CN-HG701", ...overrides };
}

async function connectStravaAccount(email: string) {
  const currentUser = db.select().from(user).where(eq(user.email, email)).get();
  expect(currentUser).toBeDefined();
  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      accountId: `strava-athlete-${currentUser!.id}`,
      providerId: "strava",
      userId: currentUser!.id,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: "read,activity:read_all,profile:read_all",
    })
    .run();
}

function todayRideDate(time = "10:00:00Z"): string {
  return `${new Date().toISOString().slice(0, 10)}T${time}`;
}

function getComponentBaseline(componentId: string) {
  const row = db.select().from(components).where(eq(components.id, componentId)).get();
  expect(row).toBeDefined();
  return row!;
}

describe("Strava import", () => {
  it("previews and commits a matched Strava bike with historical component credit", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bike = await createBikeViaGraphql(agent, "Road Bike");
    const component = await createComponentViaGraphql(agent, bike.id, {
      ...componentPayload(),
      distanceMeters: 1000,
      movingTimeMinutes: 10,
    });

    mockActivities = [
      {
        id: 123,
        gear_id: "b123",
        distance: 1234.5,
        moving_time: 3600,
        start_date: todayRideDate(),
      },
    ];
    mockAthleteBikes = [{ id: "b123", name: "Road Bike" }];

    const preview = await agent.get("/api/strava/import/preview").expect(200);
    expect(preview.body.items).toEqual([
      expect.objectContaining({
        gearId: "b123",
        stravaBikeName: "Road Bike",
        distanceMeters: 1235,
        movingTimeMinutes: 60,
        matchedBikeId: bike.id,
        matchReason: "name",
        recommendedAction: "link",
      }),
    ]);

    const committed = await agent
      .post("/api/strava/import/commit")
      .send({
        decisions: [{ gearId: "b123", action: "link", bikeId: bike.id }],
        creditHistoricalComponents: true,
      })
      .expect(200);

    expect(committed.body).toMatchObject({
      linked: 1,
      created: 0,
      skipped: 0,
      processedActivities: 1,
      creditedComponents: 1,
    });

    const baseline = getComponentBaseline(component.id);
    expect(baseline.distanceMeters).toBe(1000);
    expect(baseline.movingTimeMinutes).toBe(10);

    const detail = await getBikeViaGraphql(agent, bike.id);
    const updated = detail.components.find((c) => c.id === component.id);
    expect(updated?.wear.distanceMeters).toBe(2235);
    expect(updated?.wear.movingTimeMinutes).toBe(70);
  });

  it("skips component links for rides before credit cutoff unless historical opt-in", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bike = await createBikeViaGraphql(agent, "Old Rides Bike");
    await createComponentViaGraphql(agent, bike.id, {
      ...componentPayload(),
      distanceMeters: 500,
      movingTimeMinutes: 5,
    });

    mockActivities = [
      {
        id: 124,
        gear_id: "b124",
        distance: 5000,
        moving_time: 1800,
        start_date: "2020-01-01T10:00:00Z",
      },
    ];
    mockAthleteBikes = [{ id: "b124", name: "Old Rides Bike" }];

    const committed = await agent
      .post("/api/strava/import/commit")
      .send({
        decisions: [{ gearId: "b124", action: "link", bikeId: bike.id }],
        creditHistoricalComponents: false,
      })
      .expect(200);

    expect(committed.body).toMatchObject({
      processedActivities: 1,
      creditedComponents: 0,
    });

    const stats = await getBikeViaGraphql(agent, bike.id);
    expect(stats.rideStats).toMatchObject({
      distanceMeters: 5000,
      activityCount: 1,
    });
    expect(stats.components[0]?.wear.distanceMeters).toBe(500);
  });

  it("resolves bike names from athlete gear when activities only include gear_id", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    mockActivities = [
      {
        id: 999,
        gear_id: "b999",
        distance: 5000,
        moving_time: 1800,
        start_date: "2026-07-02T10:00:00Z",
      },
    ];
    mockAthleteBikes = [{ id: "b999", name: "Gravel Rig" }];

    const preview = await agent.get("/api/strava/import/preview").expect(200);
    expect(preview.body.items).toEqual([
      expect.objectContaining({
        gearId: "b999",
        stravaBikeName: "Gravel Rig",
        matchReason: null,
        recommendedAction: "create",
      }),
    ]);
    expect(stravaRequestPaths).toContain("/api/v3/athlete");
  });

  it("skips athlete and gear lookups when activities include embedded gear names", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    mockActivities = [
      {
        id: 100,
        gear_id: "b100",
        gear: { id: "b100", name: "Road Bike" },
        distance: 1000,
        moving_time: 600,
        start_date: "2026-07-02T10:00:00Z",
      },
    ];

    await agent.get("/api/strava/import/preview").expect(200);

    expect(stravaRequestPaths).toContain("/api/v3/athlete/activities?per_page=200&page=1");
    expect(stravaRequestPaths.some((path) => path === "/api/v3/athlete")).toBe(false);
    expect(stravaRequestPaths.some((path) => path.startsWith("/api/v3/gear/"))).toBe(false);
  });

  it("stops activity pagination when a page returns fewer than per_page items", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    mockActivities = Array.from({ length: 280 }, (_, index) => ({
      id: index + 1,
      gear_id: null,
      distance: 1000,
      moving_time: 600,
      start_date: "2026-07-02T10:00:00Z",
    }));

    await agent.get("/api/strava/import/preview").expect(200);

    const activityPages = stravaRequestPaths.filter((path) =>
      path.startsWith("/api/v3/athlete/activities"),
    );
    expect(activityPages).toHaveLength(2);
  });

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
    mockAthleteBikes = [{ id: "b1", name: "Test Bike" }];

    const preview = await agent.get("/api/strava/import/preview").expect(200);
    expect(preview.body.items).toHaveLength(1);
    expect(preview.body.items[0].distanceMeters).toBe(10000);
  });
});

describe("Strava sync", () => {
  it("credits linked active components only once for each Strava activity", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bike = await createBikeViaGraphql(agent, "Gravel Bike");
    const component = await createComponentViaGraphql(agent, bike.id, {
      ...componentPayload({ category: "chain" }),
      distanceMeters: 0,
      movingTimeMinutes: 0,
    });

    mockActivities = [];
    await agent
      .post("/api/strava/import/commit")
      .send({
        decisions: [{ gearId: "gravel-1", action: "link", bikeId: bike.id }],
      })
      .expect(200);

    mockActivities = [
      {
        id: 456,
        gear_id: "gravel-1",
        distance: 2000,
        moving_time: 1200,
        start_date: todayRideDate(),
      },
    ];
    mockAthleteBikes = [{ id: "gravel-1", name: "Gravel Bike" }];

    const first = await agent.post("/api/strava/sync").expect(200);

    const dbUser = db.select().from(user).where(eq(user.email, testUser.email)).get();
    db.update(stravaSyncState)
      .set({ lastSyncedAt: 0 })
      .where(eq(stravaSyncState.userId, dbUser!.id))
      .run();

    const second = await agent.post("/api/strava/sync").expect(200);

    expect(first.body).toMatchObject({
      processedActivities: 1,
      skippedActivities: 0,
      creditedComponents: 1,
    });
    expect(second.body).toMatchObject({
      processedActivities: 0,
      skippedActivities: 1,
      creditedComponents: 0,
    });

    const baseline = getComponentBaseline(component.id);
    expect(baseline.distanceMeters).toBe(0);
    expect(baseline.movingTimeMinutes).toBe(0);

    const stats = await getBikeViaGraphql(agent, bike.id);
    expect(stats.components[0]?.wear.distanceMeters).toBe(2000);
    expect(stats.components[0]?.wear.movingTimeMinutes).toBe(20);
  });

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

    expect(stravaRequestPaths.some((path) => path.includes("after="))).toBe(true);
  });
});

describe("Strava backfill", () => {
  it("backfills component links for activities imported without historical credit", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bike = await createBikeViaGraphql(agent, "Backfill Bike");
    await createComponentViaGraphql(agent, bike.id, componentPayload());

    mockActivities = [
      {
        id: 200,
        gear_id: "bf-1",
        sport_type: "Ride",
        distance: 3000,
        moving_time: 900,
        start_date: "2020-06-01T10:00:00Z",
      },
    ];
    mockAthleteBikes = [{ id: "bf-1", name: "Backfill Bike" }];

    await agent
      .post("/api/strava/import/commit")
      .send({
        decisions: [{ gearId: "bf-1", action: "link", bikeId: bike.id }],
        creditHistoricalComponents: false,
      })
      .expect(200);

    let stats = await getBikeViaGraphql(agent, bike.id);
    expect(stats.components[0]?.wear.distanceMeters ?? 0).toBe(0);

    const backfill = await agent.post("/api/strava/backfill-components").expect(200);
    expect(backfill.body.creditedActivities).toBe(1);

    stats = await getBikeViaGraphql(agent, bike.id);
    expect(stats.components[0]?.wear.distanceMeters).toBe(3000);
  });
});

describe("Strava import drift", () => {
  it("returns warnings when Strava data drifted since preview snapshot", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bike = await createBikeViaGraphql(agent, "Drift Bike");
    await createComponentViaGraphql(agent, bike.id, componentPayload());

    mockActivities = [
      {
        id: 301,
        gear_id: "drift-1",
        sport_type: "Ride",
        distance: 5000,
        moving_time: 1800,
        start_date: todayRideDate(),
      },
    ];
    mockAthleteBikes = [{ id: "drift-1", name: "Drift Bike" }];

    const committed = await agent
      .post("/api/strava/import/commit")
      .send({
        decisions: [{ gearId: "drift-1", action: "link", bikeId: bike.id }],
        previewSnapshot: [
          {
            gearId: "drift-1",
            activityCount: 2,
            distanceMeters: 10_000,
            movingTimeMinutes: 120,
          },
        ],
      })
      .expect(200);

    expect(committed.body.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/ride totals changed/i)]),
    );
    expect(committed.body.linked).toBe(1);
  });
});
