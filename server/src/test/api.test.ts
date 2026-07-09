import { describe, expect, it } from "vite-plus/test";
import { COMPONENT_CSV_COLUMNS } from "shared";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import {
  createBikeViaGraphql,
  createComponentViaGraphql,
  graphqlRequest,
} from "./graphql-helper.js";

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

describe("CSV import (REST)", () => {
  it("dry-run validates without committing", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Import Bike");
    const bikeId = bike.id;

    const csv = [csvHeader(), csvRow()].join("\n");

    const dry = await agent
      .post(`/api/bikes/${bikeId}/components/import`)
      .send({ csv, dryRun: true })
      .expect(200);

    expect(dry.body).toMatchObject({ dryRun: true, inserted: 1, updated: 0 });

    const detail = await graphqlRequest<{
      bike: { components: { id: string }[] };
    }>(agent, `query($id: ID!) { bike(id: $id) { components { id } } }`, { id: bikeId });
    expect(detail.body.data?.bike.components).toHaveLength(0);
  });

  it("rejects invalid CSV headers", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Bad CSV Bike");

    await agent
      .post(`/api/bikes/${bike.id}/components/import`)
      .send({ csv: "wrong,header\n,,,,,," })
      .expect(400);
  });

  it("does not reveal whether another user's component id exists", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { agent: agentB } = await createAuthenticatedAgent(app);

    const bikeA = await createBikeViaGraphql(agentA, "Private Bike");
    const foreignComponent = await createComponentViaGraphql(
      agentA,
      bikeA.id,
      componentPayload({ category: "frame", name: "Private Frame" }),
    );

    const bikeB = await createBikeViaGraphql(agentB, "Import Target");

    const invalidId = "00000000-0000-4000-8000-000000000000";
    const foreignCsv = [
      csvHeader(),
      csvRow({ id: foreignComponent.id, name: "Foreign Frame" }),
    ].join("\n");
    const unknownCsv = [csvHeader(), csvRow({ id: invalidId, name: "Unknown Frame" })].join("\n");

    const foreign = await agentB
      .post(`/api/bikes/${bikeB.id}/components/import`)
      .send({ csv: foreignCsv, dryRun: true })
      .expect(400);
    const unknown = await agentB
      .post(`/api/bikes/${bikeB.id}/components/import`)
      .send({ csv: unknownCsv, dryRun: true })
      .expect(400);

    expect(foreign.body.details).toEqual(unknown.body.details);
    expect(JSON.stringify(foreign.body.details)).not.toContain(foreignComponent.id);
    expect(JSON.stringify(foreign.body.details)).not.toContain("does not belong");
    expect(JSON.stringify(foreign.body.details)).not.toContain("exists");
  });
});
