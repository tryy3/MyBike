import { sql } from "drizzle-orm";
import request from "supertest";
import { APP_PERMISSIONS } from "shared";
import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../app.js";
import { db } from "../db/index.js";
import { ensureBootstrapAdmin } from "../lib/bootstrap-admin.js";
import { getUserPermissionSet, getUserRole, userHasPermission } from "../lib/rbac.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import { userIdForEmail } from "./api-key-helper.js";

const app = createApp();

describe("admin bootstrap and RBAC helpers", () => {
  it("seeds an idempotent bootstrap admin who can sign in and has every app permission", async () => {
    await ensureBootstrapAdmin();
    await ensureBootstrapAdmin();

    const adminId = await userIdForEmail("admin@example.com");
    const role = await getUserRole(adminId);
    const perms = await getUserPermissionSet(adminId);

    expect(role).toBe("admin");
    expect([...perms].sort()).toEqual([...APP_PERMISSIONS].sort());
    expect(userHasPermission(perms, "config.read")).toBe(true);

    const roleRows = await db.all<{ count: number }>(
      sql`SELECT COUNT(*) AS count FROM user_roles WHERE user_id = ${adminId} AND role_id = 'admin'`,
    );
    expect(roleRows[0]?.count).toBe(1);

    const accountRows = await db.all<{
      providerId: string;
      issuer: string;
      providerAccountId: string;
      userId: string;
    }>(
      sql`SELECT provider_id AS providerId, issuer, provider_account_id AS providerAccountId, user_id AS userId
          FROM account
          WHERE user_id = ${adminId}`,
    );
    expect(accountRows).toEqual([
      {
        providerId: "credential",
        issuer: "local:credential",
        providerAccountId: adminId,
        userId: adminId,
      },
    ]);

    const signIn = await request
      .agent(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "admin@example.com", password: "admin123" })
      .expect(200);

    expect(signIn.headers["set-cookie"]).toBeDefined();
  });

  it("treats signed-up users without a role as user with no admin permissions", async () => {
    const { user } = await createAuthenticatedAgent(app);
    const userId = await userIdForEmail(user.email);

    const role = await getUserRole(userId);
    const perms = await getUserPermissionSet(userId);

    expect(role).toBe("user");
    expect(perms.size).toBe(0);
    expect(userHasPermission(perms, "config.read")).toBe(false);
  });
});
