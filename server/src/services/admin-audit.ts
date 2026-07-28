import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, type AppDb } from "../db/index.js";

export const SERVER_RESTART_AUDIT_KEY = "server.restart";

export function roleAuditKey(userId: string): string {
  return `users.role:${userId}`;
}

export async function writeAdminAudit(input: {
  actorUserId: string | null;
  key: string;
  oldValue: string | null;
  newValue: string | null;
  /** Optional DB or transaction client with `run`. */
  db?: Pick<AppDb, "run">;
}): Promise<void> {
  const dbClient = input.db ?? db;
  await dbClient.run(sql`
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
