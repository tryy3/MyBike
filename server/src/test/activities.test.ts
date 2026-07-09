import { describe, expect, it } from "vite-plus/test";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import {
  createBikeViaGraphql,
  createComponentViaGraphql,
  graphqlRequest,
} from "./graphql-helper.js";
import { db } from "../db/index.js";
import { user } from "../db/auth-schema.js";
import { stravaActivities, stravaActivityComponents } from "../db/schema.js";

const app = createApp();

async function seedActivitySetup(
  agent: Awaited<ReturnType<typeof createAuthenticatedAgent>>["agent"],
  email: string,
) {
  const bike = await createBikeViaGraphql(agent, "Road");
  const chain = await createComponentViaGraphql(agent, bike.id, {
    category: "chain",
    name: "Chain A",
    brand: "Shimano",
    model: "105",
  });
  const cassette = await createComponentViaGraphql(agent, bike.id, {
    category: "cassette",
    name: "Cassette",
    brand: "Shimano",
    model: "11-28",
  });

  const testUser = db.select({ id: user.id }).from(user).where(eq(user.email, email)).get();
  expect(testUser).toBeDefined();

  const activity = db
    .insert(stravaActivities)
    .values({
      userId: testUser!.id,
      bikeId: bike.id,
      stravaActivityId: `act-${crypto.randomUUID()}`,
      stravaGearId: "gear-1",
      distanceMeters: 25000,
      movingTimeMinutes: 75,
      startDate: "2026-07-03T08:00:00Z",
    })
    .returning()
    .get();

  db.insert(stravaActivityComponents)
    .values({
      activityId: activity!.id,
      componentId: chain.id,
      distanceMeters: 25000,
      movingTimeMinutes: 75,
    })
    .run();

  return { bike, chain, cassette, activity: activity! };
}

describe("GET /api/bikes/:bikeId/activities", () => {
  it("returns 401 when unauthenticated", async () => {
    await request(app)
      .get("/api/bikes/00000000-0000-4000-8000-000000000001/activities")
      .expect(401);
  });

  it("lists activities for the bike with linked component names", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const { bike, chain, activity } = await seedActivitySetup(agent, testUser.email);

    const res = await agent.get(`/api/bikes/${bike.id}/activities`).expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      id: activity.id,
      startDate: "2026-07-03T08:00:00Z",
      distanceMeters: 25000,
      movingTimeMinutes: 75,
      componentIds: [chain.id],
      componentNames: ["Chain A"],
      editedAt: null,
    });
    expect(res.body.nextCursor).toBeNull();
  });

  it("returns 404 for another user's bike", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const { bike } = await seedActivitySetup(agent, testUser.email);

    const other = await createAuthenticatedAgent(app);
    await other.agent.get(`/api/bikes/${bike.id}/activities`).expect(404);
  });
});

describe("GET /api/activities/:id", () => {
  it("returns activity detail", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const { bike, activity } = await seedActivitySetup(agent, testUser.email);

    const res = await agent.get(`/api/activities/${activity.id}`).expect(200);

    expect(res.body.bikeId).toBe(bike.id);
    expect(res.body.distanceMeters).toBe(25000);
  });
});

describe("PATCH /api/activities/:id", () => {
  it("updates distance and replaces linked components", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const { chain, cassette, activity } = await seedActivitySetup(agent, testUser.email);

    const res = await agent
      .patch(`/api/activities/${activity.id}`)
      .send({
        distanceMeters: 20000,
        movingTimeMinutes: 60,
        componentIds: [cassette.id],
      })
      .expect(200);

    expect(res.body.distanceMeters).toBe(20000);
    expect(res.body.movingTimeMinutes).toBe(60);
    expect(res.body.componentIds).toEqual([cassette.id]);
    expect(res.body.componentNames).toEqual(["Cassette"]);
    expect(res.body.editedAt).toBeTypeOf("number");

    const junction = db
      .select()
      .from(stravaActivityComponents)
      .where(eq(stravaActivityComponents.activityId, activity.id))
      .all();

    expect(junction).toHaveLength(1);
    expect(junction[0]).toMatchObject({
      componentId: cassette.id,
      distanceMeters: 20000,
      movingTimeMinutes: 60,
    });

    const stats = await graphqlRequest<{
      bike: { components: { id: string; wear: { distanceMeters: number | null } }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components { id wear { distanceMeters } }
        }
      }`,
      { id: activity.bikeId },
    );
    const chainWear = stats.body.data?.bike.components.find((c) => c.id === chain.id);
    const cassetteWear = stats.body.data?.bike.components.find((c) => c.id === cassette.id);
    expect(chainWear?.wear.distanceMeters ?? 0).toBe(0);
    expect(cassetteWear?.wear.distanceMeters).toBe(20000);
  });

  it("returns 400 when component belongs to another bike", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const { activity } = await seedActivitySetup(agent, testUser.email);

    const otherBike = await createBikeViaGraphql(agent, "Gravel");
    const otherPart = await createComponentViaGraphql(agent, otherBike.id, {
      category: "chain",
      name: "Other chain",
      brand: "SRAM",
      model: "Force",
    });

    await agent
      .patch(`/api/activities/${activity.id}`)
      .send({
        distanceMeters: 20000,
        movingTimeMinutes: 60,
        componentIds: [otherPart.id],
      })
      .expect(400);
  });
});
