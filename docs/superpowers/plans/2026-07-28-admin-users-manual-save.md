# Admin Users Manual Save Implementation Plan

> **Status: COMPLETE (implemented on this branch).** Do not re-execute unchecked task boxes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change Admin Users so role selects edit local drafts and a page-level Save button commits all pending role updates (matching Admin Configuration).

**Architecture:** Extract pure draft helpers (`effectiveRole`, `applyRoleDraft`, `dirtyRoleAssignments`, `reconcileRoleDrafts`) with unit tests. Wire `UsersPage` to hold a `Record<userId, role>` draft map, show a header Save button, and call existing `assignUserRole` per dirty user via `Promise.allSettled`.

**Spec:** `docs/superpowers/specs/2026-07-28-admin-users-manual-save-design.md`

**Tech Stack:** React 19, TanStack Query, existing `useAssignUserRole`, Vite+ tests (`vite-plus/test`), shadcn Button/Select/Card.

## Global Constraints

- Page-level Save only — no per-row Save, Discard, or confirm dialogs
- No new GraphQL batch mutation — reuse `assignUserRole` per dirty user
- No optimistic UI — spinner on Save through mutations + refetch
- Self-role remains disabled and must never enter drafts
- Copy: card description “Change roles below, then save. Changes are not applied until you save.”
- Save label: `Save changes` / `Save N change(s)` / `Saving…`
- After partial failure: refetch, then clear drafts that now match server

## File map

| File                                                 | Responsibility                                     |
| ---------------------------------------------------- | -------------------------------------------------- |
| `client/src/features/admin/users-role-draft.ts`      | Pure draft helpers                                 |
| `client/src/features/admin/users-role-draft.test.ts` | Unit tests for draft helpers                       |
| `client/src/features/admin/UsersPage.tsx`            | Draft state, header Save, selects no longer mutate |

---

### Task 1: Role draft helpers + tests

**Files:**

- Create: `client/src/features/admin/users-role-draft.ts`
- Create: `client/src/features/admin/users-role-draft.test.ts`

**Interfaces:**

- Produces:
  - `type AdminRole = "admin" | "user"`
  - `effectiveRole(userId: string, serverRole: AdminRole, drafts: Record<string, AdminRole>): AdminRole`
  - `applyRoleDraft(drafts: Record<string, AdminRole>, userId: string, serverRole: AdminRole, nextRole: AdminRole): Record<string, AdminRole>`
  - `dirtyRoleAssignments(users: Array<{ id: string; role: AdminRole }>, drafts: Record<string, AdminRole>): Array<{ userId: string; role: AdminRole }>`
  - `reconcileRoleDrafts(users: Array<{ id: string; role: AdminRole }>, drafts: Record<string, AdminRole>): Record<string, AdminRole>`

- [ ] **Step 1: Write the failing tests**

Create `client/src/features/admin/users-role-draft.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import {
  applyRoleDraft,
  dirtyRoleAssignments,
  effectiveRole,
  reconcileRoleDrafts,
} from "./users-role-draft";

describe("effectiveRole", () => {
  it("returns the draft when present", () => {
    expect(effectiveRole("u1", "user", { u1: "admin" })).toBe("admin");
  });

  it("returns the server role when no draft", () => {
    expect(effectiveRole("u1", "user", {})).toBe("user");
  });
});

describe("applyRoleDraft", () => {
  it("stores a draft that differs from the server role", () => {
    expect(applyRoleDraft({}, "u1", "user", "admin")).toEqual({ u1: "admin" });
  });

  it("clears the draft when the next role matches the server", () => {
    expect(applyRoleDraft({ u1: "admin" }, "u1", "user", "user")).toEqual({});
  });

  it("does not mutate the previous drafts object", () => {
    const prev = { u1: "admin" as const };
    const next = applyRoleDraft(prev, "u2", "user", "admin");
    expect(prev).toEqual({ u1: "admin" });
    expect(next).toEqual({ u1: "admin", u2: "admin" });
  });
});

describe("dirtyRoleAssignments", () => {
  it("lists only users whose draft differs from the server role", () => {
    const users = [
      { id: "u1", role: "user" as const },
      { id: "u2", role: "admin" as const },
      { id: "u3", role: "user" as const },
    ];
    expect(dirtyRoleAssignments(users, { u1: "admin", u2: "admin", u3: "user" })).toEqual([
      { userId: "u1", role: "admin" },
    ]);
  });

  it("ignores draft keys for users not in the list", () => {
    expect(dirtyRoleAssignments([{ id: "u1", role: "user" }], { gone: "admin" })).toEqual([]);
  });
});

describe("reconcileRoleDrafts", () => {
  it("drops drafts that now match the server after refetch", () => {
    const users = [
      { id: "u1", role: "admin" as const },
      { id: "u2", role: "user" as const },
    ];
    expect(reconcileRoleDrafts(users, { u1: "admin", u2: "admin" })).toEqual({ u2: "admin" });
  });

  it("drops drafts for users no longer present", () => {
    expect(reconcileRoleDrafts([], { u1: "admin" })).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run -w client test -- src/features/admin/users-role-draft.test.ts`

Expected: FAIL (module `./users-role-draft` not found / cannot resolve)

- [ ] **Step 3: Implement the helpers**

Create `client/src/features/admin/users-role-draft.ts`:

```ts
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
): Array<{ userId: string; role: AdminRole }> {
  const out: Array<{ userId: string; role: AdminRole }> = [];
  for (const user of users) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run -w client test -- src/features/admin/users-role-draft.test.ts`

Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add client/src/features/admin/users-role-draft.ts client/src/features/admin/users-role-draft.test.ts
git commit -m "$(cat <<'EOF'
feat(client): add admin role draft helpers

Pure draft/reconcile helpers for page-level user role saves.
EOF
)"
```

---

### Task 2: Wire UsersPage to draft + Save

**Files:**

- Modify: `client/src/features/admin/UsersPage.tsx`
- Test: manual (see Step 4); helpers already covered in Task 1

**Interfaces:**

- Consumes: `effectiveRole`, `applyRoleDraft`, `dirtyRoleAssignments`, `reconcileRoleDrafts` from `./users-role-draft`
- Consumes: `useAdminUsers`, `useAssignUserRole` from `./api` (unchanged signatures)

- [ ] **Step 1: Replace auto-save with draft state + header Save**

Rewrite `client/src/features/admin/UsersPage.tsx` to match this structure (preserve self-role disable + Admin badge; remove per-row Saving…; use local `isSaving`):

```tsx
import { useEffect, useState } from "react";
import { Loader2Icon, SaveIcon, ShieldIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { SettingsLayout } from "@/components/SettingsLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth-client";
import type { AdminUserGql, AdminUserRoleGql } from "@/lib/graphql/operations";
import { useAdminUsers, useAssignUserRole } from "./api";
import {
  applyRoleDraft,
  dirtyRoleAssignments,
  effectiveRole,
  reconcileRoleDrafts,
  type AdminRole,
} from "./users-role-draft";

const roleOptions: AdminUserRoleGql[] = ["admin", "user"];

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function displayName(user: AdminUserGql): string {
  return user.name?.trim() || "Unnamed user";
}

export function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const users = useAdminUsers();
  const assignRole = useAssignUserRole();
  const [drafts, setDrafts] = useState<Record<string, AdminRole>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.title = "Admin users | MyBike";
    return () => {
      document.title = "MyBike";
    };
  }, []);

  const serverUsers = users.data ?? [];
  const dirty = dirtyRoleAssignments(serverUsers, drafts);
  const dirtyCount = dirty.length;

  function setDraftRole(user: AdminUserGql, role: AdminUserRoleGql): void {
    if (currentUserId != null && user.id === currentUserId) return;
    setDrafts((current) => applyRoleDraft(current, user.id, user.role, role));
  }

  async function saveChanges(): Promise<void> {
    if (dirtyCount === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const results = await Promise.allSettled(dirty.map((entry) => assignRole.mutateAsync(entry)));
      const failed = results.find((r) => r.status === "rejected");
      const refetchResult = await users.refetch();
      const latest = refetchResult.data ?? serverUsers;
      setDrafts((current) => reconcileRoleDrafts(latest, current));

      if (failed) {
        const reason = failed.status === "rejected" ? failed.reason : null;
        toast.error("Could not update user roles", {
          description: formatError(reason, "Try again."),
        });
        return;
      }

      toast.success(dirtyCount === 1 ? "1 role change saved" : `${dirtyCount} role changes saved`);
    } catch (error) {
      toast.error("Could not update user roles", {
        description: formatError(error, "Try again."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingsLayout active="/settings/admin/users">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Admin users</h2>
          <p className="text-sm text-muted-foreground">
            Assign the simple Phase 1 roles used by the admin GraphQL API.
          </p>
        </div>
        <Button onClick={() => void saveChanges()} disabled={dirtyCount === 0 || isSaving}>
          {isSaving ? (
            <>
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <SaveIcon data-icon="inline-start" />
              Save{" "}
              {dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "changes"}
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon />
            Users
          </CardTitle>
          <CardDescription>
            Change roles below, then save. Changes are not applied until you save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2Icon className="animate-spin" />
              Loading users…
            </div>
          ) : users.isError ? (
            <p className="py-4 text-sm text-destructive">
              {formatError(users.error, "Failed to load users")}
            </p>
          ) : serverUsers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serverUsers.map((user) => {
                  const isSelf = currentUserId != null && user.id === currentUserId;
                  const selectedRole = effectiveRole(user.id, user.role, drafts);
                  return (
                    <TableRow key={user.id} className={isSaving ? "opacity-60" : undefined}>
                      <TableCell className="font-medium">{displayName(user)}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isSelf ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <Select value={user.role} disabled>
                                    <SelectTrigger
                                      size="sm"
                                      className="w-32"
                                      aria-label={`Your role (${user.role}); cannot change your own role`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                  </Select>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>You cannot change your own role</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Select
                              value={selectedRole}
                              disabled={isSaving}
                              onValueChange={(role) => setDraftRole(user, role as AdminUserRoleGql)}
                            >
                              <SelectTrigger
                                size="sm"
                                className="w-32"
                                aria-label={`Role for ${displayName(user)}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {roleOptions.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {role}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          )}
                          {user.role === "admin" ? (
                            <Badge variant="secondary">
                              <ShieldIcon data-icon="inline-start" />
                              Admin
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No users found.</p>
          )}
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}
```

Notes for the implementer:

- Badge still reflects **server** `user.role` (not draft) so an unsaved demotion still shows Admin until save — acceptable for v1; do not add dirty-row chrome unless asked.
- Do not call `assignRole` from `onValueChange`.
- Keep `cn` import removed if unused.

- [ ] **Step 2: Typecheck / lint the admin feature**

Run: `vp check`

Expected: PASS for touched client files (no new errors in `UsersPage.tsx` / draft helpers)

- [ ] **Step 3: Re-run draft unit tests**

Run: `npm run -w client test -- src/features/admin/users-role-draft.test.ts`

Expected: PASS

- [ ] **Step 4: Manual verification**

With client + server running, as an admin at `/settings/admin/users`:

1. Change another user’s role — Save enables with `Save 1 change`; no toast yet; refresh without saving restores old role.
2. Click Save — toast success; role persists after refresh; Save disables.
3. Own row select stays disabled with tooltip.
4. Optionally change two users then Save — both apply; count shows `Save 2 changes`.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/admin/UsersPage.tsx
git commit -m "$(cat <<'EOF'
feat(client): require Save for admin role changes

Draft role edits locally and commit with a page-level Save button.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement                         | Task        |
| ---------------------------------------- | ----------- |
| Draft + page-level Save                  | 2           |
| Dirty when draft ≠ server                | 1, 2        |
| Header Save placement / labels           | 2           |
| Existing `assignUserRole` per dirty user | 2           |
| Pending on Save, no optimistic UI        | 2           |
| Self-role disabled / not in drafts       | 2           |
| Card copy                                | 2           |
| Partial failure: refetch + reconcile     | 1, 2        |
| No Discard / confirm / batch mutation    | — (omitted) |
