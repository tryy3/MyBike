import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { account, user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";

const app = createApp();

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
      scope: "read,activity:read_all",
    })
    .run();
}

beforeEach(() => {
  mockActivities = [];
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const requestUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(requestUrl);
    if (url.hostname !== "www.strava.com" || !url.pathname.endsWith("/athlete/activities")) {
      throw new Error(`Unexpected Strava request: ${url.toString()}`);
    }
    const page = url.searchParams.get("page") ?? "1";
    const body = page === "1" ? mockActivities : [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

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
        gear: { id: "b123", name: "Road Bike" },
        distance: 1234.5,
        moving_time: 3600,
        start_date: "2026-07-01T10:00:00Z",
      },
    ];

    const preview = await agent.get("/api/strava/import/preview").expect(200);
    expect(preview.body.items).toEqual([
      expect.objectContaining({
        gearId: "b123",
        stravaBikeName: "Road Bike",
        distanceMeters: 1235,
        movingTimeMinutes: 60,
        matchedBikeId: bike.body.id,
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
        gear: { id: "gravel-1", name: "Gravel Bike" },
        distance: 2000,
        moving_time: 1200,
        start_date: "2026-07-03T10:00:00Z",
      },
    ];

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
