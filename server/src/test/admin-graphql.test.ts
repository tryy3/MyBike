import { sql } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it, beforeEach } from "vite-plus/test";
import { createApp } from "../app.js";
import { db } from "../db/index.js";
import { ensureBootstrapAdmin } from "../lib/bootstrap-admin.js";
import { getUserRole } from "../lib/rbac.js";
import { appConfig } from "../services/app-config.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import { userIdForEmail } from "./api-key-helper.js";
import { graphqlRequest } from "./graphql-helper.js";

const app = createApp();

async function resetConfigState() {
  await db.run(sql`DELETE FROM config_audit_log`);
  await db.run(sql`DELETE FROM app_runtime_state`);
  await db.run(sql`DELETE FROM app_settings`);
  await appConfig.load();
}

async function createAdminAgent() {
  await ensureBootstrapAdmin();
  const agent = request.agent(app);
  await agent
    .post("/api/auth/sign-in/email")
    .send({ email: "admin@example.com", password: "admin123" })
    .expect(200);
  return agent;
}

beforeEach(async () => {
  await resetConfigState();
});

describe("GraphQL admin API", () => {
  it("rejects a signed-in user without admin permissions from reading settings", async () => {
    const { agent } = await createAuthenticatedAgent(app);

    const res = await graphqlRequest(agent, `query { adminSettings { pendingRestart } }`);

    expect(res.body.errors?.[0]?.message).toBe("Forbidden");
    expect(res.body.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("allows the bootstrap admin to read effective settings", async () => {
    const agent = await createAdminAgent();

    const res = await graphqlRequest<{
      adminSettings: {
        pendingRestart: boolean;
        settings: Array<{
          key: string;
          value: unknown;
          source: string;
          effect: string;
          isSecret: boolean;
          isSet: boolean;
          label: string;
          group: string;
        }>;
      };
    }>(
      agent,
      `query {
        adminSettings {
          pendingRestart
          settings {
            key
            value
            source
            effect
            isSecret
            isSet
            label
            group
          }
        }
      }`,
    );

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data?.adminSettings.pendingRestart).toBe(false);
    expect(res.body.data?.adminSettings.settings).toContainEqual(
      expect.objectContaining({
        key: "logging.level",
        value: "info",
        source: "default",
        effect: "hotReload",
        isSecret: false,
        isSet: false,
        label: "Log level",
        group: "Logging",
      }),
    );
  });

  it("allows the bootstrap admin to update logging level and read the audit entry", async () => {
    const agent = await createAdminAgent();

    const update = await graphqlRequest<{
      updateAdminSettings: {
        pendingRestart: boolean;
        settings: Array<{ key: string; value: unknown; source: string }>;
      };
    }>(
      agent,
      `mutation($inputs: [UpdateAdminSettingInput!]!) {
        updateAdminSettings(inputs: $inputs) {
          pendingRestart
          settings { key value source }
        }
      }`,
      { inputs: [{ key: "logging.level", value: "debug" }] },
    );

    expect(update.body.errors).toBeUndefined();
    expect(update.body.data?.updateAdminSettings.pendingRestart).toBe(false);
    expect(update.body.data?.updateAdminSettings.settings).toContainEqual(
      expect.objectContaining({
        key: "logging.level",
        value: "debug",
        source: "database",
      }),
    );

    const audit = await graphqlRequest<{
      adminConfigAudit: Array<{
        key: string;
        oldValue: string | null;
        newValue: string | null;
      }>;
    }>(
      agent,
      `query {
        adminConfigAudit(limit: 1) {
          key
          oldValue
          newValue
        }
      }`,
    );

    expect(audit.body.errors).toBeUndefined();
    expect(audit.body.data?.adminConfigAudit).toEqual([
      {
        key: "logging.level",
        oldValue: JSON.stringify("info"),
        newValue: JSON.stringify("debug"),
      },
    ]);
  });

  it("allows the bootstrap admin to assign a user role", async () => {
    const adminAgent = await createAdminAgent();
    const { user } = await createAuthenticatedAgent(app);
    const userId = await userIdForEmail(user.email);

    const res = await graphqlRequest<{
      assignUserRole: { id: string; email: string; role: string };
    }>(
      adminAgent,
      `mutation($userId: ID!, $role: String!) {
        assignUserRole(userId: $userId, role: $role) {
          id
          email
          role
        }
      }`,
      { userId, role: "admin" },
    );

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data?.assignUserRole).toMatchObject({
      id: userId,
      email: user.email,
      role: "admin",
    });
    expect(await getUserRole(userId)).toBe("admin");

    const users = await graphqlRequest<{
      adminUsers: Array<{ id: string; email: string; role: string }>;
    }>(
      adminAgent,
      `query {
        adminUsers {
          id
          email
          role
        }
      }`,
    );

    expect(users.body.errors).toBeUndefined();
    expect(users.body.data?.adminUsers).toContainEqual(
      expect.objectContaining({
        id: userId,
        email: user.email,
        role: "admin",
      }),
    );
  });

  it("returns true for restartServer without exiting the test process", async () => {
    const agent = await createAdminAgent();

    const res = await graphqlRequest<{ restartServer: boolean }>(
      agent,
      `mutation { restartServer }`,
    );

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data?.restartServer).toBe(true);
  });
});
