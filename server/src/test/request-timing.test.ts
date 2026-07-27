import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { db } from "../db/index.js";
import { isGraphQLTimingEnabled } from "../graphql/request-timing.js";
import { appConfig } from "../services/app-config.js";

const ACTOR_USER_ID = "request-timing-test-actor";
let originalGraphqlTiming: string | undefined;

async function resetConfigTables() {
  await db.run(sql`DELETE FROM config_audit_log`);
  await db.run(sql`DELETE FROM app_runtime_state`);
  await db.run(sql`DELETE FROM app_settings`);
  const now = Date.now();
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
      ${ACTOR_USER_ID},
      'Request Timing Test Actor',
      'request-timing-test@example.com',
      1,
      ${now},
      ${now}
    )
  `);
}

beforeEach(async () => {
  originalGraphqlTiming = process.env.GRAPHQL_TIMING;
  delete process.env.GRAPHQL_TIMING;
  await resetConfigTables();
});

afterEach(() => {
  if (originalGraphqlTiming === undefined) {
    delete process.env.GRAPHQL_TIMING;
  } else {
    process.env.GRAPHQL_TIMING = originalGraphqlTiming;
  }
});

describe("GraphQL request timing config", () => {
  it("prefers the loaded app config value over the legacy env flag", async () => {
    await db.run(sql`
      INSERT INTO app_settings (key, value, is_secret, updated_at, updated_by)
      VALUES ('graphql.timing', 'true', 0, ${Date.now()}, ${ACTOR_USER_ID})
    `);
    await appConfig.load();

    expect(isGraphQLTimingEnabled()).toBe(true);
  });
});
