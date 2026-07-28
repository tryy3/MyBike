export type AdminRole = "admin" | "user";

export function effectiveRole(
  userId: string,
  serverRole: AdminRole,
  drafts: Record<string, AdminRole>,
): AdminRole {
  return drafts[userId] ?? serverRole;
}

export function applyRoleDraft(
  drafts: Record<string, AdminRole>,
  userId: string,
  serverRole: AdminRole,
  nextRole: AdminRole,
): Record<string, AdminRole> {
  const next = { ...drafts };
  if (nextRole === serverRole) {
    delete next[userId];
  } else {
    next[userId] = nextRole;
  }
  return next;
}

export function dirtyRoleAssignments(
  users: Array<{ id: string; role: AdminRole }>,
  drafts: Record<string, AdminRole>,
  excludedUserId?: string,
): Array<{ userId: string; role: AdminRole }> {
  const out: Array<{ userId: string; role: AdminRole }> = [];
  for (const user of users) {
    if (user.id === excludedUserId) continue;
    const draft = drafts[user.id];
    if (draft != null && draft !== user.role) {
      out.push({ userId: user.id, role: draft });
    }
  }
  return out;
}

export function reconcileRoleDrafts(
  users: Array<{ id: string; role: AdminRole }>,
  drafts: Record<string, AdminRole>,
): Record<string, AdminRole> {
  const byId = new Map(users.map((u) => [u.id, u.role]));
  const next: Record<string, AdminRole> = {};
  for (const [userId, role] of Object.entries(drafts)) {
    const serverRole = byId.get(userId);
    if (serverRole != null && role !== serverRole) {
      next[userId] = role;
    }
  }
  return next;
}
