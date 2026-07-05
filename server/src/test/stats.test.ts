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

    const dbUser = db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email))
      .get();
    expect(dbUser).toBeDefined();

    const bikeA = await agent.post("/api/bikes").send({ name: "Road" }).expect(201);
    const bikeB = await agent.post("/api/bikes").send({ name: "Gravel" }).expect(201);

    db.insert(stravaActivities)
      .values([
        {
          userId: dbUser!.id,
          bikeId: bikeA.body.id,
          stravaActivityId: "act-1",
          stravaGearId: "gear-a",
          distanceMeters: 10000,
          movingTimeMinutes: 30,
          startDate: "2026-07-01T10:00:00Z",
        },
        {
          userId: dbUser!.id,
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
        category: "front-tire",
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
