# Admin Audit for All Admin Actions Implementation Plan

> **Status: COMPLETE (implemented on this branch).** Do not re-execute unchecked task boxes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record config changes, role assignments, and server restarts in one `config_audit_log` trail via a shared write helper, and show readable labels on the admin audit page.

**Architecture:** Add `writeAdminAudit` in `server/src/services/admin-audit.ts`. Route config, role, and restart mutations through it using reserved keys (`users.role:<userId>`, `server.restart`). Keep GraphQL `adminConfigAudit` unchanged. Update audit page copy + key display and invalidate the audit query from role/restart mutations.

**Spec:** `docs/superpowers/specs/2026-07-28-admin-audit-actions-design.md`

**Tech Stack:** Express/Turso SQL inserts, existing GraphQL admin schema, React + TanStack Query, Vite+ tests (`vite-plus/test`).

## Global Constraints

- No DB schema migration — reuse `config_audit_log`
- Do not rename GraphQL `adminConfigAudit` or the table
- Config secret values remain `***` in audit rows
- Role keys: `users.role:<userId>`; restart key: exact `server.restart`
- Role old/new values: `JSON.stringify(role)` (e.g. `"user"` → `"admin"`)
- Restart old/new values: both `null`
- Reserved keys must not collide with settings registry keys
- No actor/target email resolution in this pass

## File map

| File                                              | Responsibility                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `server/src/services/admin-audit.ts`              | Shared `writeAdminAudit` insert helper + key constants              |
| `server/src/services/app-config.ts`               | Call helper instead of raw audit `INSERT`                           |
| `server/src/services/admin-users.ts`              | Audit after successful role assignment                              |
| `server/src/graphql/schema/admin.ts`              | Audit on `restartServer` (async); pass actor already done for roles |
| `server/src/test/admin-graphql.test.ts`           | Assert role + restart audit rows                                    |
| `client/src/features/admin/api.ts`                | Invalidate audit on role + restart success                          |
| `client/src/features/admin/AuditPage.tsx`         | Copy + key label formatting                                         |
| `client/src/features/admin/audit-display.ts`      | Pure `formatAdminAuditKey` for labels                               |
| `client/src/features/admin/audit-display.test.ts` | Unit tests for key labels                                           |

---

### Task 1: Shared `writeAdminAudit` + config path

**Files:**

- Create: `server/src/services/admin-audit.ts`
- Modify: `server/src/services/app-config.ts`
- Test: `server/src/test/admin-config.test.ts` (existing audit test must still pass)

**Interfaces:**

- Produces:
  - `ADMIN_AUDIT_KEYS` / helpers:
    - `roleAuditKey(userId: string): string` → `` `users.role:${userId}` ``
    - `SERVER_RESTART_AUDIT_KEY = "server.restart"`
  - `writeAdminAudit(input: { actorUserId: string | null; key: string; oldValue: string | null; newValue: string | null }): Promise<void>`

- [ ] **Step 1: Write a focused failing unit-style test for the helper**

Add to `server/src/test/admin-config.test.ts` (or create `server/src/test/admin-audit.test.ts` if cleaner — prefer new file):

Create `server/src/test/admin-audit.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { describe, expect, it, beforeEach } from "vite-plus/test";
import { db } from "../db/index.js";
import {
  roleAuditKey,
  SERVER_RESTART_AUDIT_KEY,
  writeAdminAudit,
} from "../services/admin-audit.js";

const ACTOR = "actor-user-1";

beforeEach(async () => {
  await db.run(sql`DELETE FROM config_audit_log`);
});

describe("writeAdminAudit", () => {
  it("inserts a row with the given key and values", async () => {
    await writeAdminAudit({
      actorUserId: ACTOR,
      key: roleAuditKey("target-user"),
      oldValue: JSON.stringify("user"),
      newValue: JSON.stringify("admin"),
    });

    const rows = await db.all<{
      actorUserId: string | null;
      key: string;
      oldValue: string | null;
      newValue: string | null;
    }>(sql`
      SELECT
        actor_user_id AS actorUserId,
        key,
        old_value AS oldValue,
        new_value AS newValue
      FROM config_audit_log
    `);

    expect(rows).toEqual([
      {
        actorUserId: ACTOR,
        key: "users.role:target-user",
        oldValue: JSON.stringify("user"),
        newValue: JSON.stringify("admin"),
      },
    ]);
  });

  it("allows null old/new for restart-style rows", async () => {
    await writeAdminAudit({
      actorUserId: ACTOR,
      key: SERVER_RESTART_AUDIT_KEY,
      oldValue: null,
      newValue: null,
    });

    const rows = await db.all<{ key: string; oldValue: string | null; newValue: string | null }>(
      sql`
        SELECT key, old_value AS oldValue, new_value AS newValue
        FROM config_audit_log
      `,
    );

    expect(rows).toEqual([{ key: "server.restart", oldValue: null, newValue: null }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w server -- src/test/admin-audit.test.ts`

Expected: FAIL (module or export not found)

- [ ] **Step 3: Implement `admin-audit.ts`**

Create `server/src/services/admin-audit.ts`:

```ts
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

export const SERVER_RESTART_AUDIT_KEY = "server.restart";

export function roleAuditKey(userId: string): string {
  return `users.role:${userId}`;
}

export async function writeAdminAudit(input: {
  actorUserId: string | null;
  key: string;
  oldValue: string | null;
  newValue: string | null;
}): Promise<void> {
  await db.run(sql`
    INSERT INTO config_audit_log (
      id,
      actor_user_id,
      key,
      old_value,
      new_value,
      created_at
    )
    VALUES (
      ${randomUUID()},
      ${input.actorUserId},
      ${input.key},
      ${input.oldValue},
      ${input.newValue},
      ${Date.now()}
    )
  `);
}
```

- [ ] **Step 4: Refactor `app-config.ts` to use the helper**

In `server/src/services/app-config.ts`:

1. Remove `import { randomUUID } from "node:crypto"` if unused after this change.
2. Add `import { writeAdminAudit } from "./admin-audit.js";`
3. Replace the raw `INSERT INTO config_audit_log ...` block with:

```ts
await writeAdminAudit({
  actorUserId,
  key: knownKey,
  oldValue: auditOldValue,
  newValue: auditNewValue,
});
```

Keep the same `auditOldValue` / `auditNewValue` secret redaction logic above the call.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -w server -- src/test/admin-audit.test.ts src/test/admin-config.test.ts
```

Expected: PASS (including existing “writes an audit row for setting changes”)

- [ ] **Step 6: Commit**

```bash
git add server/src/services/admin-audit.ts server/src/services/app-config.ts server/src/test/admin-audit.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add shared writeAdminAudit helper

EOF
)"
```

---

### Task 2: Audit role assignment and server restart

**Files:**

- Modify: `server/src/services/admin-users.ts`
- Modify: `server/src/graphql/schema/admin.ts`
- Modify: `server/src/test/admin-graphql.test.ts`

**Interfaces:**

- Consumes: `writeAdminAudit`, `roleAuditKey`, `SERVER_RESTART_AUDIT_KEY` from Task 1
- Produces: `assignUserRole(userId, role, actorUserId)` writes an audit row after successful role update; `restartServer` writes `server.restart` then calls `requestProcessRestart()`

- [ ] **Step 1: Extend GraphQL tests (failing until wired)**

In `server/src/test/admin-graphql.test.ts`, update the existing role test to also assert audit, and extend the restart test:

After the successful `assignUserRole` assertions in `"allows the bootstrap admin to assign a user role"`, add:

```ts
const audit = await graphqlRequest<{
  adminConfigAudit: Array<{
    key: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
}>(
  adminAgent,
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
    key: `users.role:${userId}`,
    oldValue: JSON.stringify("user"),
    newValue: JSON.stringify("admin"),
  },
]);
```

Replace/extend `"returns true for restartServer without exiting the test process"`:

```ts
it("returns true for restartServer and writes an audit row", async () => {
  const agent = await createAdminAgent();

  const res = await graphqlRequest<{ restartServer: boolean }>(agent, `mutation { restartServer }`);

  expect(res.body.errors).toBeUndefined();
  expect(res.body.data?.restartServer).toBe(true);

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
      key: "server.restart",
      oldValue: null,
      newValue: null,
    },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w server -- src/test/admin-graphql.test.ts`

Expected: FAIL — role test missing audit row; restart test missing audit row

- [ ] **Step 3: Wire `assignUserRole`**

In `server/src/services/admin-users.ts`, import:

```ts
import { roleAuditKey, writeAdminAudit } from "./admin-audit.js";
```

After the successful `INSERT INTO user_roles ...` and **before** the return, add:

```ts
await writeAdminAudit({
  actorUserId,
  key: roleAuditKey(userId),
  oldValue: JSON.stringify(currentRole),
  newValue: JSON.stringify(knownRole),
});
```

Do **not** write an audit row when the function throws (own-role, not found, last admin).

- [ ] **Step 4: Wire `restartServer`**

In `server/src/graphql/schema/admin.ts`, import:

```ts
import { SERVER_RESTART_AUDIT_KEY, writeAdminAudit } from "../../services/admin-audit.js";
```

Change the resolver to async:

```ts
builder.mutationField("restartServer", (t) =>
  t.boolean({
    resolve: async (_root, _args, context) => {
      const actorUserId = requireAppPermission(context, "server.restart");
      await writeAdminAudit({
        actorUserId,
        key: SERVER_RESTART_AUDIT_KEY,
        oldValue: null,
        newValue: null,
      });
      requestProcessRestart();
      return true;
    },
  }),
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w server -- src/test/admin-graphql.test.ts`

Expected: PASS (including self-role rejection still with no audit row for the rejected attempt — optional assert: after rejected self-change, latest audit is not `users.role:<adminId>`; not required if time-boxed)

- [ ] **Step 6: Commit**

```bash
git add server/src/services/admin-users.ts server/src/graphql/schema/admin.ts server/src/test/admin-graphql.test.ts
git commit -m "$(cat <<'EOF'
feat(server): audit role changes and server restarts

EOF
)"
```

---

### Task 3: Audit page labels + client cache invalidation

**Files:**

- Create: `client/src/features/admin/audit-display.ts`
- Create: `client/src/features/admin/audit-display.test.ts`
- Modify: `client/src/features/admin/AuditPage.tsx`
- Modify: `client/src/features/admin/api.ts`

**Interfaces:**

- Produces: `formatAdminAuditKey(key: string): string`
  - `server.restart` → `Server restart`
  - `users.role:<id>` → `Role · <id>`
  - otherwise → key unchanged

- [ ] **Step 1: Write failing unit tests for labels**

Create `client/src/features/admin/audit-display.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
import { formatAdminAuditKey } from "./audit-display";

describe("formatAdminAuditKey", () => {
  it("labels server restart", () => {
    expect(formatAdminAuditKey("server.restart")).toBe("Server restart");
  });

  it("labels role changes with the target user id", () => {
    expect(formatAdminAuditKey("users.role:abc-123")).toBe("Role · abc-123");
  });

  it("leaves config keys unchanged", () => {
    expect(formatAdminAuditKey("logging.level")).toBe("logging.level");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w client -- src/features/admin/audit-display.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement `audit-display.ts`**

```ts
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
```

- [ ] **Step 4: Update `AuditPage.tsx`**

1. Import `formatAdminAuditKey` from `./audit-display`.
2. Change subtitle to: `Review recent admin changes.`
3. Change card description to: `Secret values are redacted. Role changes and server restarts are included.`
4. In the Key cell, render `{formatAdminAuditKey(entry.key)}` instead of `{entry.key}`. Keep mono styling for config keys; for friendlier labels, use:

```tsx
<TableCell className={entry.key.includes(".") && !entry.key.startsWith("users.role:") ? "font-mono" : undefined}>
```

Prefer simpler: always use normal weight for labeled rows:

```tsx
<TableCell
  className={
    entry.key === "server.restart" || entry.key.startsWith("users.role:") ? undefined : "font-mono"
  }
>
  {formatAdminAuditKey(entry.key)}
</TableCell>
```

- [ ] **Step 5: Invalidate audit cache on role and restart**

In `client/src/features/admin/api.ts`:

`useRestartServer`:

```ts
export function useRestartServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const data = await graphqlFetch<{ restartServer: boolean }>(RESTART_SERVER_MUTATION);
      return data.restartServer;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
}
```

`useAssignUserRole` `onSuccess`:

```ts
onSuccess: async () => {
  await Promise.all([
    qc.invalidateQueries({ queryKey: adminQueryKeys.users }),
    qc.invalidateQueries({ queryKey: ["admin", "audit"] }),
  ]);
},
```

- [ ] **Step 6: Run client tests + format/lint check**

Run:

```bash
npm test -w client -- src/features/admin/audit-display.test.ts
vp check
```

Expected: PASS / clean for touched files

- [ ] **Step 7: Commit**

```bash
git add client/src/features/admin/audit-display.ts client/src/features/admin/audit-display.test.ts client/src/features/admin/AuditPage.tsx client/src/features/admin/api.ts
git commit -m "$(cat <<'EOF'
feat(client): show role and restart rows on admin audit

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement                                  | Task                         |
| ------------------------------------------------- | ---------------------------- |
| Shared `writeAdminAudit` helper                   | Task 1                       |
| Config path uses helper; secrets still `***`      | Task 1                       |
| Role key `users.role:<userId>` + JSON role values | Task 2                       |
| Restart key `server.restart` with null/null       | Task 2                       |
| Keep `adminConfigAudit`                           | Task 2 (read path untouched) |
| GraphQL tests for role + restart audit            | Task 2                       |
| Audit page copy + key labels                      | Task 3                       |
| Invalidate audit on role/restart                  | Task 3                       |
| No schema migration / rename                      | All tasks                    |
