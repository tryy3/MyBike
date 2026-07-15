import { describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { createApp } from "../app.js";
import { db } from "../db/index.js";
import { maintenanceTasks } from "../db/schema.js";
import { syncMaintenanceTemplates } from "../services/maintenance.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import {
  createBikeViaGraphql,
  createComponentViaGraphql,
  graphqlRequest,
} from "./graphql-helper.js";
import { MAINTENANCE_TEMPLATES, MAINTENANCE_TEMPLATE_BY_KEY } from "shared";

const app = createApp();

const BIKE_MAINTENANCE_QUERY = `query($id: ID!) {
  bike(id: $id) {
    id
    maintenanceAlertCount
    maintenanceTasks {
      id
      kind
      source
      templateKey
      title
      enabled
      canDelete
      status
    }
  }
}`;

describe("GraphQL maintenance", () => {
  it("seeds built-in tasks when a bike is created", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Maint Bike");

    const res = await graphqlRequest<{
      bike: { maintenanceTasks: { source: string; canDelete: boolean }[] };
    }>(agent, BIKE_MAINTENANCE_QUERY, { id: bike.id });

    expect(res.body.errors).toBeUndefined();
    const tasks = res.body.data!.bike.maintenanceTasks;
    expect(tasks).toHaveLength(MAINTENANCE_TEMPLATES.length);
    expect(tasks.every((t) => t.source === "builtin" && t.canDelete === false)).toBe(true);
  });

  it("rejects deleting built-in tasks", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Builtin Delete");

    const listed = await graphqlRequest<{
      bike: { maintenanceTasks: { id: string }[] };
    }>(agent, BIKE_MAINTENANCE_QUERY, { id: bike.id });
    const taskId = listed.body.data!.bike.maintenanceTasks[0]!.id;

    const deleted = await graphqlRequest(
      agent,
      `mutation($id: ID!) { deleteMaintenanceTask(id: $id) }`,
      {
        id: taskId,
      },
    );
    expect(deleted.body.errors?.[0]?.message).toContain("cannot be deleted");
  });

  it("allows creating and deleting custom tasks", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Custom Task Bike");

    const created = await graphqlRequest<{
      createMaintenanceTask: { id: string; canDelete: boolean };
    }>(
      agent,
      `mutation($bikeId: ID!, $input: MaintenanceTaskInsertInput!) {
        createMaintenanceTask(bikeId: $bikeId, input: $input) { id canDelete source }
      }`,
      {
        bikeId: bike.id,
        input: {
          kind: "touch_up",
          title: "Custom wipe down",
        },
      },
    );
    expect(created.body.data?.createMaintenanceTask.canDelete).toBe(true);

    const taskId = created.body.data!.createMaintenanceTask.id;
    const deleted = await graphqlRequest<{ deleteMaintenanceTask: boolean }>(
      agent,
      `mutation($id: ID!) { deleteMaintenanceTask(id: $id) }`,
      { id: taskId },
    );
    expect(deleted.body.data?.deleteMaintenanceTask).toBe(true);
  });

  it("allows updating distance and guide URL on built-in tasks", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Builtin Edit");

    const listed = await graphqlRequest<{
      bike: { maintenanceTasks: { id: string; templateKey: string | null }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          maintenanceTasks { id templateKey }
        }
      }`,
      { id: bike.id },
    );
    const chainEol = listed.body.data!.bike.maintenanceTasks.find(
      (t) => t.templateKey === "chain-eol",
    )!;

    const updated = await graphqlRequest<{
      updateMaintenanceTask: { customized: boolean; distanceMeters: number; guideUrl: string };
    }>(
      agent,
      `mutation($id: ID!, $input: MaintenanceTaskUpdateInput!) {
        updateMaintenanceTask(id: $id, input: $input) {
          customized
          distanceMeters
          guideUrl
        }
      }`,
      {
        id: chainEol.id,
        input: { distanceMeters: 2_500_000, guideUrl: "https://example.com/chain" },
      },
    );
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data!.updateMaintenanceTask.customized).toBe(true);
    expect(updated.body.data!.updateMaintenanceTask.distanceMeters).toBe(2_500_000);
    expect(updated.body.data!.updateMaintenanceTask.guideUrl).toBe("https://example.com/chain");
  });

  it("rejects changing locked fields on built-in tasks", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Builtin Locked");

    const listed = await graphqlRequest<{
      bike: { maintenanceTasks: { id: string; templateKey: string | null }[] };
    }>(agent, BIKE_MAINTENANCE_QUERY, { id: bike.id });
    const chainEol = listed.body.data!.bike.maintenanceTasks.find(
      (t) => t.templateKey === "chain-eol",
    )!;

    const updated = await graphqlRequest(
      agent,
      `mutation($id: ID!, $input: MaintenanceTaskUpdateInput!) {
        updateMaintenanceTask(id: $id, input: $input) { id }
      }`,
      { id: chainEol.id, input: { title: "Custom chain name" } },
    );
    expect(updated.body.errors?.[0]?.message).toContain("cannot be changed");
  });

  it("allows full edit of custom tasks", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Custom Edit");

    const created = await graphqlRequest<{
      createMaintenanceTask: { id: string };
    }>(
      agent,
      `mutation($bikeId: ID!, $input: MaintenanceTaskInsertInput!) {
        createMaintenanceTask(bikeId: $bikeId, input: $input) { id }
      }`,
      {
        bikeId: bike.id,
        input: {
          kind: "periodic",
          title: "Original title",
          componentCategory: "chain",
          triggerMode: "distance",
          distanceMeters: 100_000,
        },
      },
    );
    const taskId = created.body.data!.createMaintenanceTask.id;

    const updated = await graphqlRequest<{
      updateMaintenanceTask: { title: string; distanceMeters: number };
    }>(
      agent,
      `mutation($id: ID!, $input: MaintenanceTaskUpdateInput!) {
        updateMaintenanceTask(id: $id, input: $input) { title distanceMeters }
      }`,
      {
        id: taskId,
        input: { title: "Renamed task", distanceMeters: 200_000 },
      },
    );
    expect(updated.body.errors).toBeUndefined();
    expect(updated.body.data!.updateMaintenanceTask.title).toBe("Renamed task");
    expect(updated.body.data!.updateMaintenanceTask.distanceMeters).toBe(200_000);
  });

  it("reports EOL due when component wear exceeds limit", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "EOL Bike");

    const chain = await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Chain",
      brand: "KMC",
      model: "X11",
      isActive: true,
      distanceMeters: 3_500_000,
    });

    expect(chain.isActive).toBe(true);

    const res = await graphqlRequest<{
      bike: {
        maintenanceAlertCount: number;
        maintenanceTasks: { templateKey: string | null; status: string }[];
      };
    }>(agent, BIKE_MAINTENANCE_QUERY, { id: bike.id });

    const chainEol = res.body.data!.bike.maintenanceTasks.find(
      (t) => t.templateKey === "chain-eol",
    );
    expect(chainEol?.status).toBe("due");
    expect(res.body.data!.bike.maintenanceAlertCount).toBeGreaterThan(0);
  });

  it("toggles touch-up checklist items on and off", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Touch Up Toggle");

    const listed = await graphqlRequest<{
      bike: { maintenanceTasks: { id: string; kind: string; lastCheckedAt: number | null }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          maintenanceTasks { id kind lastCheckedAt }
        }
      }`,
      { id: bike.id },
    );
    const touchUp = listed.body.data!.bike.maintenanceTasks.find((t) => t.kind === "touch_up")!;

    const checked = await graphqlRequest<{
      toggleTouchUpCheckItem: { id: string; lastCheckedAt: number | null };
    }>(
      agent,
      `mutation($taskId: ID!) {
        toggleTouchUpCheckItem(taskId: $taskId) { id lastCheckedAt }
      }`,
      { taskId: touchUp.id },
    );
    expect(checked.body.errors).toBeUndefined();
    expect(checked.body.data!.toggleTouchUpCheckItem.lastCheckedAt).not.toBeNull();

    const unchecked = await graphqlRequest<{
      toggleTouchUpCheckItem: { id: string; lastCheckedAt: number | null };
    }>(
      agent,
      `mutation($taskId: ID!) {
        toggleTouchUpCheckItem(taskId: $taskId) { id lastCheckedAt }
      }`,
      { taskId: touchUp.id },
    );
    expect(unchecked.body.errors).toBeUndefined();
    expect(unchecked.body.data!.toggleTouchUpCheckItem.lastCheckedAt).toBeNull();
  });

  it("clears all touch-up checklist items for a bike", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Touch Up Clear");

    const listed = await graphqlRequest<{
      bike: { maintenanceTasks: { id: string; kind: string }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          maintenanceTasks { id kind }
        }
      }`,
      { id: bike.id },
    );
    const touchUps = listed.body.data!.bike.maintenanceTasks.filter((t) => t.kind === "touch_up");
    expect(touchUps.length).toBeGreaterThan(1);

    for (const task of touchUps) {
      await graphqlRequest(
        agent,
        `mutation($taskId: ID!) { toggleTouchUpCheckItem(taskId: $taskId) { id } }`,
        { taskId: task.id },
      );
    }

    const cleared = await graphqlRequest<{
      clearTouchUpChecklist: { id: string; lastCheckedAt: number | null }[];
    }>(
      agent,
      `mutation($bikeId: ID!) {
        clearTouchUpChecklist(bikeId: $bikeId) { id lastCheckedAt }
      }`,
      { bikeId: bike.id },
    );
    expect(cleared.body.errors).toBeUndefined();
    expect(cleared.body.data!.clearTouchUpChecklist.every((t) => t.lastCheckedAt == null)).toBe(
      true,
    );
  });
});

describe("syncMaintenanceTemplates", () => {
  it("inserts missing built-in rows for existing bikes", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Sync Insert");

    const chainLube = await db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.bikeId, bike.id))
      .all()
      .then((rows) => rows.find((row) => row.templateKey === "chain-lube"));
    expect(chainLube).toBeDefined();

    await db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, chainLube!.id)).run();

    const before = await db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.bikeId, bike.id))
      .all();
    expect(before).toHaveLength(MAINTENANCE_TEMPLATES.length - 1);

    const result = await syncMaintenanceTemplates();
    expect(result.inserted).toBeGreaterThanOrEqual(1);

    const after = await db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.bikeId, bike.id))
      .all();
    expect(after).toHaveLength(MAINTENANCE_TEMPLATES.length);
    expect(after.some((row) => row.templateKey === "chain-lube")).toBe(true);
  });

  it("refreshes non-customized rows from current templates", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Sync Refresh");

    const chainEol = await db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.bikeId, bike.id))
      .all()
      .then((rows) => rows.find((row) => row.templateKey === "chain-eol"));
    expect(chainEol).toBeDefined();
    expect(chainEol!.customized).toBe(false);

    await db
      .update(maintenanceTasks)
      .set({ description: "Stale description from an old template version" })
      .where(eq(maintenanceTasks.id, chainEol!.id))
      .run();

    const result = await syncMaintenanceTemplates();
    expect(result.updated).toBeGreaterThanOrEqual(1);

    const refreshed = await db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.id, chainEol!.id))
      .get();
    expect(refreshed!.description).toBe(MAINTENANCE_TEMPLATE_BY_KEY.get("chain-eol")!.description);
  });

  it("skips customized rows during sync", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Sync Customized");

    const listed = await graphqlRequest<{
      bike: { maintenanceTasks: { id: string; templateKey: string | null }[] };
    }>(
      agent,
      `query($id: ID!) {
        bike(id: $id) {
          maintenanceTasks { id templateKey }
        }
      }`,
      { id: bike.id },
    );
    const chainEol = listed.body.data!.bike.maintenanceTasks.find(
      (t) => t.templateKey === "chain-eol",
    )!;

    const customDistance = 2_500_000;
    await graphqlRequest(
      agent,
      `mutation($id: ID!, $input: MaintenanceTaskUpdateInput!) {
        updateMaintenanceTask(id: $id, input: $input) { customized distanceMeters }
      }`,
      { id: chainEol.id, input: { distanceMeters: customDistance } },
    );

    await db
      .update(maintenanceTasks)
      .set({ description: "User-facing stale description" })
      .where(eq(maintenanceTasks.id, chainEol.id))
      .run();

    await syncMaintenanceTemplates();

    const row = await db
      .select()
      .from(maintenanceTasks)
      .where(eq(maintenanceTasks.id, chainEol.id))
      .get();
    expect(row!.customized).toBe(true);
    expect(row!.distanceMeters).toBe(customDistance);
    expect(row!.description).toBe("User-facing stale description");
  });
});
