export const APP_PERMISSIONS = [
  "config.read",
  "config.write",
  "server.restart",
  "users.read",
  "users.assign_role",
  "audit.read",
] as const;
export type AppPermission = (typeof APP_PERMISSIONS)[number];

export const APP_ROLES = ["admin", "user"] as const;
export type AppRole = (typeof APP_ROLES)[number];
