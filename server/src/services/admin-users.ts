import { eq, sql } from "drizzle-orm";
import { APP_ROLES, type AppRole } from "shared";
import { user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { HttpError } from "../lib/errors.js";
import { getUserRole } from "../lib/rbac.js";
import { roleAuditKey, writeAdminAudit } from "./admin-audit.js";

export type AdminUserView = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
};

function assertAppRole(role: string): AppRole {
  if (!APP_ROLES.includes(role as AppRole)) {
    throw new HttpError(400, `Unknown app role: ${role}`);
  }
  return role as AppRole;
}

async function countAdmins(): Promise<number> {
  const rows = await db.all<{ count: number }>(
    sql`SELECT COUNT(*) AS count FROM user_roles WHERE role_id = 'admin'`,
  );
  return rows[0]?.count ?? 0;
}

export async function listAdminUsers(): Promise<AdminUserView[]> {
  const rows = await db.all<AdminUserView>(sql`
    SELECT
      "user".id,
      "user".email,
      "user".name,
      CASE WHEN user_roles.role_id = 'admin' THEN 'admin' ELSE 'user' END AS role
    FROM "user"
    LEFT JOIN user_roles ON user_roles.user_id = "user".id
    ORDER BY lower("user".email)
  `);

  return rows;
}

export async function assignUserRole(
  userId: string,
  role: AppRole,
  actorUserId: string,
): Promise<AdminUserView> {
  if (userId === actorUserId) {
    throw new HttpError(400, "Cannot change your own role");
  }

  const knownRole = assertAppRole(role);
  const target = await db.select().from(user).where(eq(user.id, userId)).get();
  if (!target) {
    throw new HttpError(404, "User not found");
  }

  const currentRole = await getUserRole(userId);
  if (currentRole === "admin" && knownRole !== "admin" && (await countAdmins()) <= 1) {
    throw new HttpError(400, "Cannot demote the last admin");
  }

  await db.run(sql`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (${userId}, ${knownRole})
    ON CONFLICT(user_id) DO UPDATE SET role_id = ${knownRole}
  `);

  await writeAdminAudit({
    actorUserId,
    key: roleAuditKey(userId),
    oldValue: JSON.stringify(currentRole),
    newValue: JSON.stringify(knownRole),
  });

  return {
    id: target.id,
    email: target.email,
    name: target.name,
    role: knownRole,
  };
}
