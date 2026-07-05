import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { account, user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";

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
    const start = (page - 1) * perPage;
    const body = mockActivities.slice(start, start + perPage);
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

describe("Strava import", () => {
  it("previews and commits a matched Strava bike into active component mileage", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bike = await agent.post("/api/bikes").send({ name: "Road Bike" }).expect(201);
    const component = await agent
      .post(`/api/bikes/${bike.body.id}/components`)
      .send(componentPayload({ distanceMeters: 1000, movingTimeMinutes: 10 }))
      .expect(201);

    mockActivities = [
      {
        id: 123,
        gear_id: "b123",
        distance: 1234.5,
        moving_time: 3600,
        start_date: "2026-07-01T10:00:00Z",
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
        matchedBikeId: bike.body.id,
        matchReason: "name",
        recommendedAction: "link",
      }),
    ]);

    const committed = await agent
      .post("/api/strava/import/commit")
      .send({
        decisions: [{ gearId: "b123", action: "link", bikeId: bike.body.id }],
      })
      .expect(200);

    expect(committed.body).toMatchObject({
      linked: 1,
      created: 0,
      skipped: 0,
      processedActivities: 1,
      creditedComponents: 1,
    });

    const detail = await agent.get(`/api/bikes/${bike.body.id}`).expect(200);
    const updated = detail.body.components.find((c: { id: string }) => c.id === component.body.id);
    expect(updated.distanceMeters).toBe(2235);
    expect(updated.movingTimeMinutes).toBe(70);
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
});

describe("Strava sync", () => {
  it("credits linked active components only once for each Strava activity", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const bike = await agent.post("/api/bikes").send({ name: "Gravel Bike" }).expect(201);
    await agent
      .post(`/api/bikes/${bike.body.id}/components`)
      .send(componentPayload({ category: "chain", distanceMeters: 0, movingTimeMinutes: 0 }))
      .expect(201);

    mockActivities = [];
    await agent
      .post("/api/strava/import/commit")
      .send({
        decisions: [{ gearId: "gravel-1", action: "link", bikeId: bike.body.id }],
      })
      .expect(200);

    mockActivities = [
      {
        id: 456,
        gear_id: "gravel-1",
        distance: 2000,
        moving_time: 1200,
        start_date: "2026-07-03T10:00:00Z",
      },
    ];
    mockAthleteBikes = [{ id: "gravel-1", name: "Gravel Bike" }];

    const first = await agent.post("/api/strava/sync").expect(200);
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

    const detail = await agent.get(`/api/bikes/${bike.body.id}`).expect(200);
    expect(detail.body.components[0].distanceMeters).toBe(2000);
    expect(detail.body.components[0].movingTimeMinutes).toBe(20);
  });
});
