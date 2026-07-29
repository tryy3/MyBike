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
  await db.run(sql`
    INSERT OR IGNORE INTO "user" (
      id,
      name,
      email,
      email_verified,
      created_at,
      updated_at
    )
    VALUES (
      ${ACTOR},
      'Admin Audit Test Actor',
      'admin-audit-test@example.com',
      1,
      ${Date.now()},
      ${Date.now()}
    )
  `);
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
