const ROLE_KEY_PREFIX = "users.role:";

export function formatAdminAuditKey(key: string): string {
  if (key === "server.restart") {
    return "Server restart";
  }
  if (key.startsWith(ROLE_KEY_PREFIX)) {
    return `Role · ${key.slice(ROLE_KEY_PREFIX.length)}`;
  }
  return key;
}
