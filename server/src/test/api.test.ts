import { describe, expect, it } from "vite-plus/test";
import request from "supertest";
import { COMPONENT_CSV_COLUMNS } from "shared";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";

const app = createApp();

function csvHeader(): string {
  return COMPONENT_CSV_COLUMNS.join(",");
}

function componentPayload(overrides: Record<string, unknown> = {}) {
  return { category: "frame", name: "Part", brand: "Brand", model: "Model", ...overrides };
}

function csvRow(values: Partial<Record<string, string>> = {}) {
  const defaults: Record<string, string> = {
    id: "",
    category: "frame",
    name: "Imported Frame",
    brand: "Brand",
    model: "Model",
    notes: "",
    isActive: "false",
    distanceMeters: "",
    movingTimeMinutes: "",
    purchaseDate: "",
    purchaseCost: "",
    purchaseStore: "",
  };
  const row = { ...defaults, ...values };
  return COMPONENT_CSV_COLUMNS.map((col) => row[col]).join(",");
}

describe("authentication", () => {
  it("returns 401 for unauthenticated bike list", async () => {
    await request(app).get("/api/bikes").expect(401);
  });

  it("isolates bikes between users", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { agent: agentB } = await createAuthenticatedAgent(app);

    const bike = await agentA.post("/api/bikes").send({ name: "User A Bike" }).expect(201);

    await agentB.get(`/api/bikes/${bike.body.id}`).expect(404);
    const listB = await agentB.get("/api/bikes").expect(200);
    expect(listB.body).toHaveLength(0);
  });
});

describe("active component invariant", () => {
  it("auto-activates the first component in a category", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Invariant Bike" }).expect(201);

    const created = await agent
      .post(`/api/bikes/${bike.body.id}/components`)
      .send(componentPayload({ category: "frame", name: "Frame A", isActive: false }))
      .expect(201);

    expect(created.body.isActive).toBe(true);
  });

  it("deactivates siblings when creating an active component", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Sibling Bike" }).expect(201);
    const bikeId = bike.body.id;

    const first = await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send(componentPayload({ category: "fork", name: "Fork A", isActive: false }))
      .expect(201);

    const second = await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send(componentPayload({ category: "fork", name: "Fork B", isActive: true }))
      .expect(201);

    expect(second.body.isActive).toBe(true);

    const detail = await agent.get(`/api/bikes/${bikeId}`).expect(200);
    const forks = detail.body.components.filter((c: { category: string }) => c.category === "fork");
    expect(forks.filter((c: { isActive: boolean }) => c.isActive)).toHaveLength(1);
    expect(forks.find((c: { id: string }) => c.id === first.body.id)?.isActive).toBe(false);
  });

  it("activates one component via PATCH /activate", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Activate Bike" }).expect(201);
    const bikeId = bike.body.id;

    const a = await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send(componentPayload({ category: "front-wheel", name: "Wheel A", isActive: false }))
      .expect(201);
    const b = await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send(componentPayload({ category: "front-wheel", name: "Wheel B", isActive: false }))
      .expect(201);

    await agent.patch(`/api/components/${b.body.id}/activate`).expect(200);

    const detail = await agent.get(`/api/bikes/${bikeId}`).expect(200);
    const wheels = detail.body.components.filter(
      (c: { category: string }) => c.category === "front-wheel",
    );
    expect(wheels.find((c: { id: string }) => c.id === b.body.id)?.isActive).toBe(true);
    expect(wheels.find((c: { id: string }) => c.id === a.body.id)?.isActive).toBe(false);
  });
});

describe("CSV import", () => {
  it("dry-run validates without committing", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Import Bike" }).expect(201);
    const bikeId = bike.body.id;

    const csv = [csvHeader(), csvRow()].join("\n");

    const dry = await agent
      .post(`/api/bikes/${bikeId}/components/import`)
      .send({ csv, dryRun: true })
      .expect(200);

    expect(dry.body).toMatchObject({ dryRun: true, inserted: 1, updated: 0 });

    const detail = await agent.get(`/api/bikes/${bikeId}`).expect(200);
    expect(detail.body.components).toHaveLength(0);
  });

  it("rejects invalid CSV headers", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Bad CSV Bike" }).expect(201);

    await agent
      .post(`/api/bikes/${bike.body.id}/components/import`)
      .send({ csv: "wrong,header\n,,,,,," })
      .expect(400);
  });

  it("does not reveal whether another user's component id exists", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { agent: agentB } = await createAuthenticatedAgent(app);

    const bikeA = await agentA.post("/api/bikes").send({ name: "Private Bike" }).expect(201);
    const foreignComponent = await agentA
      .post(`/api/bikes/${bikeA.body.id}/components`)
      .send(componentPayload({ category: "frame", name: "Private Frame" }))
      .expect(201);

    const bikeB = await agentB.post("/api/bikes").send({ name: "Import Target" }).expect(201);

    const invalidId = "00000000-0000-4000-8000-000000000000";
    const foreignCsv = [
      csvHeader(),
      csvRow({ id: foreignComponent.body.id, name: "Foreign Frame" }),
    ].join("\n");
    const unknownCsv = [csvHeader(), csvRow({ id: invalidId, name: "Unknown Frame" })].join("\n");

    const foreign = await agentB
      .post(`/api/bikes/${bikeB.body.id}/components/import`)
      .send({ csv: foreignCsv, dryRun: true })
      .expect(400);
    const unknown = await agentB
      .post(`/api/bikes/${bikeB.body.id}/components/import`)
      .send({ csv: unknownCsv, dryRun: true })
      .expect(400);

    expect(foreign.body.details).toEqual(unknown.body.details);
    expect(JSON.stringify(foreign.body.details)).not.toContain(foreignComponent.body.id);
    expect(JSON.stringify(foreign.body.details)).not.toContain("does not belong");
    expect(JSON.stringify(foreign.body.details)).not.toContain("exists");
  });
});

describe("reorder", () => {
  it("requires a complete permutation of component ids", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Reorder Bike" }).expect(201);
    const bikeId = bike.body.id;

    const a = await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send(componentPayload({ category: "crankset", name: "Crank A", isActive: false }))
      .expect(201);
    await agent
      .post(`/api/bikes/${bikeId}/components`)
      .send(componentPayload({ category: "crankset", name: "Crank B", isActive: false }))
      .expect(201);

    await agent
      .patch(`/api/bikes/${bikeId}/components/reorder`)
      .send({ category: "crankset", orderedIds: [a.body.id] })
      .expect(400);
  });
});

describe("bikes CRUD", () => {
  it("returns 404 for unknown bike", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    await agent.get("/api/bikes/00000000-0000-4000-8000-000000000000").expect(404);
  });

  it("returns 400 for empty bike update", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Update Bike" }).expect(201);

    await agent.put(`/api/bikes/${bike.body.id}`).send({}).expect(400);
  });
});

describe("component metadata", () => {
  it("round-trips optional usage and purchase fields", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await agent.post("/api/bikes").send({ name: "Meta Bike" }).expect(201);

    const created = await agent
      .post(`/api/bikes/${bike.body.id}/components`)
      .send(
        componentPayload({
          category: "chain",
          name: "Chain",
          brand: "Shimano",
          model: "CN-HG701",
          distanceMeters: 1500000,
          movingTimeMinutes: 125,
          purchaseDate: "2023-01-10",
          purchaseCost: 45.5,
          purchaseStore: "Local shop",
        }),
      )
      .expect(201);

    expect(created.body).toMatchObject({
      distanceMeters: 1500000,
      movingTimeMinutes: 125,
      purchaseDate: "2023-01-10",
      purchaseCost: 45.5,
      purchaseStore: "Local shop",
    });
  });
});

describe("field suggestions", () => {
  it("returns garage-wide deduped suggestions for the authenticated user", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { agent: agentB } = await createAuthenticatedAgent(app);

    const bikeA = await agentA.post("/api/bikes").send({ name: "Garage A" }).expect(201);
    const bikeB = await agentA.post("/api/bikes").send({ name: "Garage B" }).expect(201);

    await agentA
      .post(`/api/bikes/${bikeA.body.id}/components`)
      .send(
        componentPayload({
          category: "frame",
          name: "Race Frame",
          brand: "Bianchi",
          model: "Oltre",
          purchaseStore: "Shop One",
        }),
      )
      .expect(201);
    await agentA
      .post(`/api/bikes/${bikeB.body.id}/components`)
      .send(
        componentPayload({
          category: "fork",
          name: "Race Fork",
          brand: "bianchi",
          model: "Fork Pro",
          purchaseStore: "Shop One",
        }),
      )
      .expect(201);

    const suggestions = await agentA.get("/api/field-suggestions").expect(200);
    expect(suggestions.body.brand).toEqual(["Bianchi"]);
    expect(suggestions.body.name).toEqual(["Race Fork", "Race Frame"]);
    expect(suggestions.body.purchaseStore).toEqual(["Shop One"]);

    await agentB.get("/api/field-suggestions").expect(200);
    expect((await agentB.get("/api/field-suggestions")).body.brand).toEqual([]);
  });
});
