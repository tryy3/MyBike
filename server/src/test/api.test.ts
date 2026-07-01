import { describe, expect, it } from "vitest";
import request from "supertest";
import { COMPONENT_CSV_COLUMNS } from "shared";
import { createApp } from "../app.js";

const app = createApp();

function csvHeader(): string {
  return COMPONENT_CSV_COLUMNS.join(",");
}

describe("active component invariant", () => {
  it("auto-activates the first component in a category", async () => {
    const bike = await request(app)
      .post("/api/bikes")
      .send({ name: "Invariant Bike" })
      .expect(201);

    const created = await request(app)
      .post(`/api/bikes/${bike.body.id}/components`)
      .send({ category: "frame", name: "Frame A", isActive: false })
      .expect(201);

    expect(created.body.isActive).toBe(true);
  });

  it("deactivates siblings when creating an active component", async () => {
    const bike = await request(app)
      .post("/api/bikes")
      .send({ name: "Sibling Bike" })
      .expect(201);
    const bikeId = bike.body.id;

    const first = await request(app)
      .post(`/api/bikes/${bikeId}/components`)
      .send({ category: "fork", name: "Fork A", isActive: false })
      .expect(201);

    const second = await request(app)
      .post(`/api/bikes/${bikeId}/components`)
      .send({ category: "fork", name: "Fork B", isActive: true })
      .expect(201);

    expect(second.body.isActive).toBe(true);

    const detail = await request(app).get(`/api/bikes/${bikeId}`).expect(200);
    const forks = detail.body.components.filter(
      (c: { category: string }) => c.category === "fork",
    );
    expect(forks.filter((c: { isActive: boolean }) => c.isActive)).toHaveLength(
      1,
    );
    expect(
      forks.find((c: { id: string }) => c.id === first.body.id)?.isActive,
    ).toBe(false);
  });

  it("activates one component via PATCH /activate", async () => {
    const bike = await request(app)
      .post("/api/bikes")
      .send({ name: "Activate Bike" })
      .expect(201);
    const bikeId = bike.body.id;

    const a = await request(app)
      .post(`/api/bikes/${bikeId}/components`)
      .send({ category: "front-wheel", name: "Wheel A", isActive: false })
      .expect(201);
    const b = await request(app)
      .post(`/api/bikes/${bikeId}/components`)
      .send({ category: "front-wheel", name: "Wheel B", isActive: false })
      .expect(201);

    await request(app)
      .patch(`/api/components/${b.body.id}/activate`)
      .expect(200);

    const detail = await request(app).get(`/api/bikes/${bikeId}`).expect(200);
    const wheels = detail.body.components.filter(
      (c: { category: string }) => c.category === "front-wheel",
    );
    expect(wheels.find((c: { id: string }) => c.id === b.body.id)?.isActive).toBe(
      true,
    );
    expect(wheels.find((c: { id: string }) => c.id === a.body.id)?.isActive).toBe(
      false,
    );
  });
});

describe("CSV import", () => {
  it("dry-run validates without committing", async () => {
    const bike = await request(app)
      .post("/api/bikes")
      .send({ name: "Import Bike" })
      .expect(201);
    const bikeId = bike.body.id;

    const csv = [
      csvHeader(),
      ",frame,Imported Frame,,,,false",
    ].join("\n");

    const dry = await request(app)
      .post(`/api/bikes/${bikeId}/components/import`)
      .send({ csv, dryRun: true })
      .expect(200);

    expect(dry.body).toMatchObject({ dryRun: true, inserted: 1, updated: 0 });

    const detail = await request(app).get(`/api/bikes/${bikeId}`).expect(200);
    expect(detail.body.components).toHaveLength(0);
  });

  it("rejects invalid CSV headers", async () => {
    const bike = await request(app)
      .post("/api/bikes")
      .send({ name: "Bad CSV Bike" })
      .expect(201);

    await request(app)
      .post(`/api/bikes/${bike.body.id}/components/import`)
      .send({ csv: "wrong,header\n,,,,,," })
      .expect(400);
  });
});

describe("reorder", () => {
  it("requires a complete permutation of component ids", async () => {
    const bike = await request(app)
      .post("/api/bikes")
      .send({ name: "Reorder Bike" })
      .expect(201);
    const bikeId = bike.body.id;

    const a = await request(app)
      .post(`/api/bikes/${bikeId}/components`)
      .send({ category: "crankset", name: "Crank A", isActive: false })
      .expect(201);
    await request(app)
      .post(`/api/bikes/${bikeId}/components`)
      .send({ category: "crankset", name: "Crank B", isActive: false })
      .expect(201);

    await request(app)
      .patch(`/api/bikes/${bikeId}/components/reorder`)
      .send({ category: "crankset", orderedIds: [a.body.id] })
      .expect(400);
  });
});

describe("bikes CRUD", () => {
  it("returns 404 for unknown bike", async () => {
    await request(app)
      .get("/api/bikes/00000000-0000-4000-8000-000000000000")
      .expect(404);
  });

  it("returns 400 for empty bike update", async () => {
    const bike = await request(app)
      .post("/api/bikes")
      .send({ name: "Update Bike" })
      .expect(201);

    await request(app).put(`/api/bikes/${bike.body.id}`).send({}).expect(400);
  });
});
