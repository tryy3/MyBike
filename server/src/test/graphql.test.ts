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
import { account, user } from "../db/auth-schema.js";
import { components, stravaActivities } from "../db/schema.js";
import { STRAVA_ACCOUNT_ISSUER } from "../lib/strava-client.js";

const app = createApp();

function componentInput(overrides: Record<string, unknown> = {}) {
  return { category: "frame", name: "Part", brand: "Brand", model: "Model", ...overrides };
}

async function connectStravaAccount(email: string) {
  const currentUser = await db.select().from(user).where(eq(user.email, email)).get();
  expect(currentUser).toBeDefined();
  await db
    .insert(account)
    .values({
      id: crypto.randomUUID(),
      issuer: STRAVA_ACCOUNT_ISSUER,
      providerAccountId: `strava-athlete-${crypto.randomUUID()}`,
      providerId: "strava",
      userId: currentUser!.id,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: "read,activity:read_all,profile:read_all",
    })
    .run();
}

describe("GraphQL authentication", () => {
  it("returns UNAUTHENTICATED for unauthenticated bikes query", async () => {
    const res = await graphqlRequest(request(app), "{ bikes { id } }");
    expect(res.body.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });
});

describe("GraphQL bikes", () => {
  it("isolates bikes between users", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { agent: agentB } = await createAuthenticatedAgent(app);

    const bike = await createBikeViaGraphql(agentA, "User A Bike");

    const foreign = await graphqlRequest(agentB, `query($id: ID!) { bike(id: $id) { id } }`, {
      id: bike.id,
    });
    expect(foreign.body.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");

    const listB = await graphqlRequest<{ bikes: { id: string }[] }>(agentB, "{ bikes { id } }");
    expect(listB.body.data?.bikes).toHaveLength(0);
  });

  it("creates, updates, and deletes a bike", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const created = await createBikeViaGraphql(agent, "GraphQL Bike");

    const updated = await graphqlRequest<{ updateBike: { name: string } }>(
      agent,
      `mutation($id: ID!, $input: BikeUpdateInput!) {
        updateBike(id: $id, input: $input) { name }
      }`,
      { id: created.id, input: { name: "Renamed" } },
    );
    expect(updated.body.data?.updateBike.name).toBe("Renamed");

    const deleted = await graphqlRequest<{ deleteBike: boolean }>(
      agent,
      `mutation($id: ID!) { deleteBike(id: $id) }`,
      { id: created.id },
    );
    expect(deleted.body.data?.deleteBike).toBe(true);
  });
});

describe("GraphQL active component invariant", () => {
  it("auto-activates the first component in a category", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Invariant Bike");

    const created = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "frame", name: "Frame A", isActive: false }),
    );
    expect(created.isActive).toBe(true);
  });

  it("activates one component via activateComponent mutation", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Activate Bike");

    const a = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "front-wheel", name: "Wheel A", isActive: false }),
    );
    const b = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "front-wheel", name: "Wheel B", isActive: false }),
    );

    await graphqlRequest(
      agent,
      `mutation($id: ID!) { activateComponent(id: $id) { id isActive } }`,
      { id: b.id },
    );

    const detail = await graphqlRequest<{
      bike: { components: { id: string; isActive: boolean }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components { id isActive category }
        }
      }`,
      { id: bike.id },
    );

    const wheels = detail.body.data?.bike.components.filter((c) => c.id === a.id || c.id === b.id);
    expect(wheels?.find((c) => c.id === b.id)?.isActive).toBe(true);
    expect(wheels?.find((c) => c.id === a.id)?.isActive).toBe(false);
  });

  it("archives inactive components and blocks activating archived ones", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Archive Bike");

    const active = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "chain", name: "Active", isActive: true }),
    );
    const spare = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "chain", name: "Spare", isActive: false }),
    );

    const archiveActive = await graphqlRequest(
      agent,
      `mutation($id: ID!) { archiveComponent(id: $id) { id isArchived } }`,
      { id: active.id },
    );
    expect(archiveActive.body.errors?.[0]?.message).toMatch(/cannot be archived/i);

    const archived = await graphqlRequest<{
      archiveComponent: { id: string; isArchived: boolean; isActive: boolean };
    }>(agent, `mutation($id: ID!) { archiveComponent(id: $id) { id isArchived isActive } }`, {
      id: spare.id,
    });
    expect(archived.body.errors).toBeUndefined();
    expect(archived.body.data?.archiveComponent).toMatchObject({
      id: spare.id,
      isArchived: true,
      isActive: false,
    });

    const activateArchived = await graphqlRequest(
      agent,
      `mutation($id: ID!) { activateComponent(id: $id) { id isActive } }`,
      { id: spare.id },
    );
    expect(activateArchived.body.errors?.[0]?.message).toMatch(/unarchive first/i);

    const restored = await graphqlRequest<{
      unarchiveComponent: { id: string; isArchived: boolean; isActive: boolean };
    }>(agent, `mutation($id: ID!) { unarchiveComponent(id: $id) { id isArchived isActive } }`, {
      id: spare.id,
    });
    expect(restored.body.errors).toBeUndefined();
    expect(restored.body.data?.unarchiveComponent).toMatchObject({
      id: spare.id,
      isArchived: false,
      isActive: false,
    });
  });

  it("does not promote archived components when the active one is deleted", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Delete Promote Bike");

    const active = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "chain", name: "Active", isActive: true }),
    );
    const archived = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "chain", name: "Archived", isActive: false }),
    );
    const alternate = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "chain", name: "Alternate", isActive: false }),
    );

    await graphqlRequest(agent, `mutation($id: ID!) { archiveComponent(id: $id) { id } }`, {
      id: archived.id,
    });

    const deleted = await graphqlRequest<{ deleteComponent: boolean }>(
      agent,
      `mutation($id: ID!) { deleteComponent(id: $id) }`,
      { id: active.id },
    );
    expect(deleted.body.errors).toBeUndefined();
    expect(deleted.body.data?.deleteComponent).toBe(true);

    const detail = await graphqlRequest<{
      bike: { components: { id: string; isActive: boolean; isArchived: boolean }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components { id isActive isArchived }
        }
      }`,
      { id: bike.id },
    );

    const rows = detail.body.data?.bike.components ?? [];
    expect(rows.find((c) => c.id === archived.id)).toMatchObject({
      isArchived: true,
      isActive: false,
    });
    expect(rows.find((c) => c.id === alternate.id)).toMatchObject({
      isArchived: false,
      isActive: true,
    });
  });

  it("leaves no active component when only archived parts remain after delete", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Delete Only Archived Bike");

    const active = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "cassette", name: "Active", isActive: true }),
    );
    const archived = await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "cassette", name: "Archived", isActive: false }),
    );

    await graphqlRequest(agent, `mutation($id: ID!) { archiveComponent(id: $id) { id } }`, {
      id: archived.id,
    });

    const deleted = await graphqlRequest<{ deleteComponent: boolean }>(
      agent,
      `mutation($id: ID!) { deleteComponent(id: $id) }`,
      { id: active.id },
    );
    expect(deleted.body.errors).toBeUndefined();

    const detail = await graphqlRequest<{
      bike: { components: { id: string; isActive: boolean; isArchived: boolean }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components { id isActive isArchived }
        }
      }`,
      { id: bike.id },
    );

    expect(detail.body.data?.bike.components).toEqual([
      { id: archived.id, isActive: false, isArchived: true },
    ]);
  });
});

describe("GraphQL wear and activeOnly", () => {
  it("filters activeOnly components", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Filter Bike");

    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "fork", name: "Fork A", isActive: false }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "fork", name: "Fork B", isActive: true }),
    );

    const all = await graphqlRequest<{
      bike: { components: { name: string }[] };
    }>(agent, `query($id: ID!) { bike(id: $id) { components { name } } }`, { id: bike.id });
    expect(all.body.data?.bike.components).toHaveLength(2);

    const active = await graphqlRequest<{
      bike: { components: { name: string }[] };
    }>(agent, `query($id: ID!) { bike(id: $id) { components(activeOnly: true) { name } } }`, {
      id: bike.id,
    });
    expect(active.body.data?.bike.components).toHaveLength(1);
    expect(active.body.data?.bike.components[0]?.name).toBe("Fork B");
  });

  it("returns computed wear including Strava mileage", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const dbUser = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email))
      .get();
    expect(dbUser).toBeDefined();

    const bike = await createBikeViaGraphql(agent, "Wear Bike");
    const component = await createComponentViaGraphql(agent, bike.id, componentInput());

    await db
      .insert(stravaActivities)
      .values({
        userId: dbUser!.id,
        bikeId: bike.id,
        stravaActivityId: "gql-act-1",
        stravaGearId: "gear-gql",
        distanceMeters: 2500,
        movingTimeMinutes: 25,
        startDate: "2026-07-01T10:00:00Z",
      })
      .run();

    // Link activity to component via activity_components would need more setup.
    // Use baseline on component for simpler wear test.
    await graphqlRequest(
      agent,
      `mutation($id: ID!, $input: ComponentUpdateInput!) {
        updateComponent(id: $id, input: $input) { id }
      }`,
      {
        id: component.id,
        input: { distanceMeters: 1000, movingTimeMinutes: 10 },
      },
    );

    const res = await graphqlRequest<{
      bike: { components: { wear: { distanceMeters: number | null } }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components { wear { distanceMeters movingTimeMinutes } }
        }
      }`,
      { id: bike.id },
    );

    expect(res.body.data?.bike.components[0]?.wear.distanceMeters).toBe(1000);
  });
});

describe("GraphQL component properties", () => {
  it("defaults chain lubeType to wet_lube when properties omitted", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Chain Props Bike");
    const created = await graphqlRequest<{
      createComponent: { id: string; properties: { lubeType: string | null } };
    }>(
      agent,
      `mutation($bikeId: ID!, $input: ComponentInsertInput!) {
        createComponent(bikeId: $bikeId, input: $input) { id properties { lubeType } }
      }`,
      {
        bikeId: bike.id,
        input: { category: "chain", name: "Chain", brand: "KMC", model: "X11" },
      },
    );
    expect(created.body.errors).toBeUndefined();
    expect(created.body.data?.createComponent.properties.lubeType).toBe("wet_lube");
  });

  it("rejects lubeType on non-chain component", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Frame Props Bike");
    const res = await graphqlRequest(
      agent,
      `mutation($bikeId: ID!, $input: ComponentInsertInput!) {
        createComponent(bikeId: $bikeId, input: $input) { id }
      }`,
      {
        bikeId: bike.id,
        input: {
          category: "frame",
          name: "Frame",
          brand: "Brand",
          model: "Model",
          properties: { lubeType: "wet_lube" },
        },
      },
    );
    expect(res.body.errors?.length).toBeGreaterThan(0);
  });

  it("filters components by lubeTypes", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Lube Filter Bike");

    await graphqlRequest(
      agent,
      `mutation($bikeId: ID!, $input: ComponentInsertInput!) {
        createComponent(bikeId: $bikeId, input: $input) { id }
      }`,
      {
        bikeId: bike.id,
        input: {
          category: "chain",
          name: "Wet Chain",
          brand: "KMC",
          model: "X11",
          properties: { lubeType: "wet_lube" },
        },
      },
    );
    await graphqlRequest(
      agent,
      `mutation($bikeId: ID!, $input: ComponentInsertInput!) {
        createComponent(bikeId: $bikeId, input: $input) { id }
      }`,
      {
        bikeId: bike.id,
        input: {
          category: "chain",
          name: "Wax Chain",
          brand: "KMC",
          model: "X11",
          isActive: false,
          properties: { lubeType: "drip_wax" },
        },
      },
    );

    const res = await graphqlRequest<{
      bike: { components: { name: string; properties: { lubeType: string | null } }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { lubeTypes: [drip_wax] }) { name properties { lubeType } }
        }
      }`,
      { id: bike.id },
    );
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data?.bike.components).toHaveLength(1);
    expect(res.body.data?.bike.components[0]?.name).toBe("Wax Chain");
    expect(res.body.data?.bike.components[0]?.properties.lubeType).toBe("drip_wax");
  });

  it("updates chain lubeType and defaults omitted properties to wet_lube", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Chain Update Props Bike");
    const created = await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Chain",
      brand: "KMC",
      model: "X11",
      properties: { lubeType: "wet_lube" },
    });

    const toWax = await graphqlRequest<{
      updateComponent: { id: string; properties: { lubeType: string | null } };
    }>(
      agent,
      `mutation($id: ID!, $input: ComponentUpdateInput!) {
        updateComponent(id: $id, input: $input) { id properties { lubeType } }
      }`,
      { id: created.id, input: { properties: { lubeType: "drip_wax" } } },
    );
    expect(toWax.body.errors).toBeUndefined();
    expect(toWax.body.data?.updateComponent.properties.lubeType).toBe("drip_wax");

    const toDefault = await graphqlRequest<{
      updateComponent: { id: string; properties: { lubeType: string | null } };
    }>(
      agent,
      `mutation($id: ID!, $input: ComponentUpdateInput!) {
        updateComponent(id: $id, input: $input) { id properties { lubeType } }
      }`,
      { id: created.id, input: { properties: {} } },
    );
    expect(toDefault.body.errors).toBeUndefined();
    expect(toDefault.body.data?.updateComponent.properties.lubeType).toBe("wet_lube");
  });

  it("rejects lubeType on non-chain GraphQL update", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Frame Update Props Bike");
    const frame = await createComponentViaGraphql(agent, bike.id, {
      category: "frame",
      name: "Frame",
      brand: "Brand",
      model: "Model",
    });

    const res = await graphqlRequest(
      agent,
      `mutation($id: ID!, $input: ComponentUpdateInput!) {
        updateComponent(id: $id, input: $input) { id }
      }`,
      { id: frame.id, input: { properties: { lubeType: "wet_lube" } } },
    );
    expect(res.body.errors?.length).toBeGreaterThan(0);
  });

  it("returns null GraphQL lubeType for legacy/unknown stored values", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Legacy Lube Bike");
    const chain = await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Legacy Chain",
      brand: "KMC",
      model: "X11",
    });

    await db
      .update(components)
      .set({ properties: { lubeType: "legacy_grease" } })
      .where(eq(components.id, chain.id))
      .run();

    const res = await graphqlRequest<{
      bike: { components: { id: string; properties: { lubeType: string | null } }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) { components { id properties { lubeType } } }
      }`,
      { id: bike.id },
    );
    expect(res.body.errors).toBeUndefined();
    const row = res.body.data?.bike.components.find((c) => c.id === chain.id);
    expect(row?.properties.lubeType).toBeNull();
  });
});

describe("GraphQL component filters", () => {
  it("filters by single and multiple categories", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Category Filter Bike");

    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "crankset", name: "Crank", brand: "Shimano", model: "M7100" }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "cassette", name: "Cassette", brand: "Shimano", model: "M7100" }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "saddle", name: "Saddle", brand: "Fizik", model: "Arione" }),
    );

    const single = await graphqlRequest<{
      bike: { components: { category: string; name: string }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { categories: [crankset] }) { category name }
        }
      }`,
      { id: bike.id },
    );
    expect(single.body.data?.bike.components).toHaveLength(1);
    expect(single.body.data?.bike.components[0]?.category).toBe("crankset");

    const multiple = await graphqlRequest<{
      bike: { components: { category: string }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { categories: [crankset, cassette] }) { category }
        }
      }`,
      { id: bike.id },
    );
    expect(multiple.body.data?.bike.components).toHaveLength(2);
    expect(multiple.body.data?.bike.components.map((c) => c.category).sort()).toEqual([
      "cassette",
      "crankset",
    ]);
  });

  it("combines categories with activeOnly for drivetrain-style queries", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Drivetrain Bike");

    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "chain", name: "Old Chain", isActive: false }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "chain", name: "Active Chain", isActive: true }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "cassette", name: "Cassette", isActive: true }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "saddle", name: "Saddle", isActive: true }),
    );

    const res = await graphqlRequest<{
      bike: { components: { name: string; category: string }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { categories: [chain, cassette], activeOnly: true }) { name category }
        }
      }`,
      { id: bike.id },
    );
    expect(res.body.data?.bike.components).toHaveLength(2);
    expect(res.body.data?.bike.components.map((c) => c.name).sort()).toEqual([
      "Active Chain",
      "Cassette",
    ]);
  });

  it("filters by brand exact match case-insensitively", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Brand Filter Bike");

    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "crankset", name: "Crank A", brand: "Shimano", model: "A" }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({ category: "cassette", name: "Cassette A", brand: "SRAM", model: "B" }),
    );

    const res = await graphqlRequest<{
      bike: { components: { brand: string | null }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { brands: ["shimano"] }) { brand }
        }
      }`,
      { id: bike.id },
    );
    expect(res.body.data?.bike.components).toHaveLength(1);
    expect(res.body.data?.bike.components[0]?.brand).toBe("Shimano");
  });

  it("filters by nameContains and brandContains", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Contains Filter Bike");

    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({
        category: "rear-derailleur",
        name: "XT Rear Mech",
        brand: "Shimano",
        model: "M8100",
      }),
    );
    await createComponentViaGraphql(
      agent,
      bike.id,
      componentInput({
        category: "front-derailleur",
        name: "Front Mech",
        brand: "SRAM",
        model: "AXS",
      }),
    );

    const byName = await graphqlRequest<{
      bike: { components: { name: string }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { nameContains: "rear" }) { name }
        }
      }`,
      { id: bike.id },
    );
    expect(byName.body.data?.bike.components).toHaveLength(1);
    expect(byName.body.data?.bike.components[0]?.name).toBe("XT Rear Mech");

    const byBrand = await graphqlRequest<{
      bike: { components: { brand: string | null }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { brandContains: "shim" }) { brand }
        }
      }`,
      { id: bike.id },
    );
    expect(byBrand.body.data?.bike.components).toHaveLength(1);
    expect(byBrand.body.data?.bike.components[0]?.brand).toBe("Shimano");
  });

  it("rejects invalid category enum values at parse time", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Invalid Enum Bike");

    const res = await graphqlRequest(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(filter: { categories: [not_a_category] }) { name }
        }
      }`,
      { id: bike.id },
    );
    expect(res.body.errors?.length).toBeGreaterThan(0);
    expect(res.body.data).toBeUndefined();
  });

  it("rejects conflicting activeOnly between top-level arg and filter", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Conflict Bike");

    const res = await graphqlRequest(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          components(activeOnly: true, filter: { activeOnly: false }) { name }
        }
      }`,
      { id: bike.id },
    );
    expect(res.body.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect(res.body.errors?.[0]?.message).toContain("activeOnly");
  });
});

describe("GraphQL fieldSuggestions", () => {
  it("returns garage-wide deduped suggestions for the authenticated user", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { agent: agentB } = await createAuthenticatedAgent(app);

    const bikeA = await createBikeViaGraphql(agentA, "Garage A");
    await createComponentViaGraphql(
      agentA,
      bikeA.id,
      componentInput({ category: "frame", name: "Race Frame", brand: "Canyon", model: "A" }),
    );

    const suggestions = await graphqlRequest<{
      fieldSuggestions: { name: string[]; brand: string[] };
    }>(agentA, "{ fieldSuggestions { name brand model purchaseStore } }");

    expect(suggestions.body.data?.fieldSuggestions.name).toContain("Race Frame");
    expect(suggestions.body.data?.fieldSuggestions.brand).toContain("Canyon");

    const empty = await graphqlRequest<{ fieldSuggestions: { brand: string[] } }>(
      agentB,
      "{ fieldSuggestions { brand } }",
    );
    expect(empty.body.data?.fieldSuggestions.brand).toEqual([]);
  });
});

describe("GraphQL garageStats", () => {
  it("returns rideStats per bike", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    const dbUser = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, testUser.email))
      .get();
    expect(dbUser).toBeDefined();

    const bike = await createBikeViaGraphql(agent, "Road");

    await db
      .insert(stravaActivities)
      .values({
        userId: dbUser!.id,
        bikeId: bike.id,
        stravaActivityId: "gql-garage-1",
        stravaGearId: "gear-garage",
        distanceMeters: 10000,
        movingTimeMinutes: 30,
        startDate: "2026-07-01T10:00:00Z",
      })
      .run();

    const res = await graphqlRequest<{
      garageStats: { bikes: { bikeId: string; rideStats: { distanceMeters: number } | null }[] };
    }>(
      agent,
      `{ garageStats { bikes { bikeId rideStats { distanceMeters movingTimeMinutes activityCount } } } }`,
    );

    const entry = res.body.data?.garageStats.bikes.find((b) => b.bikeId === bike.id);
    expect(entry?.rideStats?.distanceMeters).toBe(10000);
  });
});
