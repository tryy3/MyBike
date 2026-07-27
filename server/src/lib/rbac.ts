import { eq } from "drizzle-orm";
import type { AppRole } from "shared";
import { db } from "../db/index.js";
import { permissions, rolePermissions, userRoles } from "../db/schema.js";

export async function getUserPermissionSet(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ permissionId: permissions.id })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId))
    .all();

  return new Set(rows.map((row) => row.permissionId));
}

export async function getUserRole(userId: string): Promise<AppRole> {
  const row = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .get();

  return row?.roleId === "admin" ? "admin" : "user";
}

export function userHasPermission(perms: Set<string>, permission: string): boolean {
  return perms.has(permission);
}
