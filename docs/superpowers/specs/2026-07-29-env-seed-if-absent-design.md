# Env seed-if-absent (replace live env override)

**Date:** 2026-07-29  
**Status:** Approved  
**Context:** Live `envOverride` for `BETTER_AUTH_URL` / `CLIENT_URL` locks Admin Configuration when those vars are set, which blocks the intended workflow (boot on localhost → configure real domain in UI → rename domain later). Recovery via permanent env-wins is the wrong tradeoff for MyBike.  
**Parent:** `docs/superpowers/specs/2026-07-28-admin-runtime-config-phase-2-design.md`

## Summary

Replace continuous env override with **seed-if-absent**: if a legacy env var is set and the corresponding `app_settings` row does **not** exist, write that value into the DB once at boot. Afterward, **database > code default** is the only runtime precedence. If env remains set while a row exists, log a **friendly non-fatal warning** urging operators to remove it (so an accidental row delete does not silently re-seed). Drop `envVar` / `source: "env"` from the admin API/UI. Move **`PORT`** into the registry as `server.port` with the same seed rule. Keep true bootstrap (DB connection + encryption + auth secret + platform/migrate tooling) in `.env`. Proxy-process env stays out of scope. A settings CLI for break-glass edits is explicitly deferred.

## Goals

- Allow localhost → production domain → domain rename entirely from Admin UI
- One obvious source of truth for runtime settings: `app_settings` (+ code defaults)
- Easy first-boot / migrate path: set env once, row appears, then remove env
- Easy reset: delete the DB row → next boot re-seeds from env if present
- Warn when leftover env could surprise after a row delete
- Seed as many non-bootstrap knobs as practical in this change

## Non-goals

- Live env override / `source: "env"` read-only UI
- Showing `envVar` or “seeded from …” hints in GraphQL/Admin UI
- Moving DB path, Turso URL/token, `CONFIG_ENCRYPTION_KEY`, or `BETTER_AUTH_SECRET` into `app_settings`
- Managing proxy-process configuration from MyBike
- Shipping a settings CLI in this pass (document as follow-up)
- Auto-enabling OAuth/integration from presence of seeded credentials alone (`enabled` stays explicit defaults)

## Decisions

| Topic        | Choice                                                                             |
| ------------ | ---------------------------------------------------------------------------------- |
| Precedence   | DB override > code default (plus inherit where declared)                           |
| Env role     | First-boot / missing-row **seed** only                                             |
| Leftover env | Warn in logs; do not apply                                                         |
| Recovery     | Delete `app_settings` row (+ optional future CLI); re-seed on next boot if env set |
| API          | Remove `envOverride` behavior and `envVar` field from admin GraphQL                |
| `PORT`       | New registry key `server.port`; seed from `PORT`; listen after config load         |
| Secrets seed | Allowed (encrypt on write using bootstrap `CONFIG_ENCRYPTION_KEY`)                 |

## Architecture

### Bootstrap vs runtime

**Bootstrap (stay `.env`, never seeded into `app_settings` as sole source):**

- `DB_PATH`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `CONFIG_ENCRYPTION_KEY`
- `BETTER_AUTH_SECRET`
- `NODE_ENV`
- `RUN_MIGRATIONS`, `DRIZZLE_MIGRATIONS_FOLDER`, `SQLITE_IMPORT_PATH`

**Runtime (registry + DB):** everything else operators may tune, including `server.port`, auth/client URLs, logging, GraphQL timing, webhook client, OAuth providers, Strava integration.

### Boot sequence

1. Load bootstrap `.env` / process env
2. Open database (bootstrap)
3. Apply migrations if configured
4. `appConfig.load()`:
   - Read existing `app_settings` rows
   - **Seed-if-absent** for every registry entry with `seedFromEnv`
   - Resolve effective map (inherit → DB → default)
   - **Warn** for each `seedFromEnv` where env is set and row already exists
5. Sync derived process env for legacy consumers from **effective** config (`syncLoggingEnvFromConfig`, `syncAuthEnvFromConfig` — always write from config; do not treat leftover `CLIENT_URL` as winning)
6. `initLogging()` / auth construction / listen on `appConfig.get("server.port")`

### Registry metadata

Replace `envOverride?: { varName: string }` with:

```ts
seedFromEnv?: {
  varName: string;
  /** Optional parse for non-JSON env strings (bools, ports, timing flags). */
  parse?: (raw: string) => unknown;
};
```

If `parse` is omitted, use the setting’s Zod schema after a sensible default coercion (JSON parse if value looks like JSON; otherwise pass string through `schema.parse`).

### Seed algorithm (per key)

```
if definition.seedFromEnv is missing → skip
raw = env[varName]
if raw is undefined or trim === "" → skip
if app_settings row for key exists →
  log warn (see copy below)
  skip
else →
  value = parse(raw) via schema
  upsert app_settings (encrypt if secret)
  audit actor null / "system", old null, new redacted if secret
```

Invalid env values: **do not crash boot** — log warn and skip seed for that key; fall back to code default.

### Warning copy (normative intent)

Warn level, once per key per process:

> `{VAR} is set in the environment but {key} already exists in app_settings; the env value is ignored. Remove {VAR} from .env to avoid accidental re-seed if the database row is deleted.`

### Auth / port consumers

- Remove “only set env if unset” bias that preserves leftover override: `syncAuthEnvFromConfig` should set `BETTER_AUTH_URL` / `CLIENT_URL` from **effective** config always (or clear-and-set) so stale env cannot win inside Better Auth after load.
- `server.port`: default `3001`; effect `restartRequired`; `index.ts` listens using config after load (not `process.env.PORT` alone). Seed from `PORT` when row missing. Optional: still allow unset PORT → default before first seed.

## Seed map (this change)

| Registry key                          | `seedFromEnv`                     | Notes                                                         |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `server.port`                         | `PORT`                            | New key; int parse                                            |
| `betterAuth.baseUrl`                  | `BETTER_AUTH_URL`                 | Was `envOverride`                                             |
| `client.url`                          | `CLIENT_URL`                      | Was `envOverride`                                             |
| `logging.level`                       | `LOG_LEVEL`                       |                                                               |
| `logging.toFile`                      | `LOG_TO_FILE`                     | Parse: unset skip; `"false"` → false; else true               |
| `logging.filePath`                    | `LOG_FILE_PATH`                   |                                                               |
| `logging.redact`                      | `LOG_REDACT`                      | Same bool parse as `LOG_TO_FILE`                              |
| `graphql.timing`                      | `GRAPHQL_TIMING`                  | `"1"`/`"true"`/`"yes"` → true; else false if set              |
| `strava.webhook.pollIntervalMs`       | `STRAVA_WEBHOOK_POLL_INTERVAL_MS` | int                                                           |
| `strava.webhook.proxyApiKey`          | `STRAVA_WEBHOOK_PROXY_API_KEY`    | secret                                                        |
| `strava.webhook.proxyUrl`             | `STRAVA_WEBHOOK_PROXY_URL`        |                                                               |
| `strava.webhook.subscriptionId`       | `STRAVA_SUBSCRIPTION_ID`          | string                                                        |
| `oauth.providers.tsidp.clientId`      | `TSIDP_CLIENT_ID`                 |                                                               |
| `oauth.providers.tsidp.clientSecret`  | `TSIDP_CLIENT_SECRET`             | secret                                                        |
| `oauth.providers.tsidp.issuer`        | `TSIDP_ISSUER`                    |                                                               |
| `oauth.providers.tsidp.scopes`        | `TSIDP_SCOPES`                    |                                                               |
| `oauth.providers.strava.clientId`     | `STRAVA_CLIENT_ID`                |                                                               |
| `oauth.providers.strava.clientSecret` | `STRAVA_CLIENT_SECRET`            | secret                                                        |
| `oauth.providers.strava.scopes`       | `STRAVA_SCOPES`                   | Same env may also seed integration scopes if that row missing |
| `integration.strava.clientId`         | `STRAVA_CLIENT_ID`                | Same env as login id when both rows missing                   |
| `integration.strava.clientSecret`     | `STRAVA_CLIENT_SECRET`            | secret                                                        |
| `integration.strava.redirectUri`      | `STRAVA_REDIRECT_URI`             |                                                               |
| `integration.strava.scopes`           | `STRAVA_SCOPES`                   |                                                               |

**No `seedFromEnv`:** `oauth.providers.*.enabled`, `integration.strava.enabled`, `integration.strava.inheritCredentials` — keep code defaults (`false` / `true`). Operators enable explicitly in UI after credentials exist.

Shared env for Strava client id/secret/scopes seeding both oauth and integration rows is intentional for first boot; inherit still applies at read time when `inheritCredentials` is true.

## GraphQL / Admin UI

- Remove `envVar` from `AdminSetting` / client types / queries
- Remove `source: "env"` from `SETTING_VALUE_SOURCES` and GraphQL enum (sources: `database` \| `default` \| `inherited`)
- Remove env read-only badge/copy; fields for seeded keys are editable like any DB-backed setting
- Update precedence caption: database > default (+ inherited where applicable)

## Documentation

Update `docs/admin-runtime-config-migration.md` and `.env.example` / `AGENTS.md`:

- Precedence is no longer “env wins”
- Env vars listed above are **first-boot seeds**; remove them after successful boot/seed
- Leftover env produces a log warning
- Reset = delete row (SQL / future CLI)
- Bootstrap table unchanged for DB/crypto/secret/tooling

## Testing

- Missing row + valid env → row created; effective source `database`; value matches
- Existing row + env set → value unchanged; warn logged once
- Existing row + env unset → no warn
- Invalid env → warn + skip; default/DB unchanged; process continues
- `server.port` seed + listen uses config
- `syncAuthEnvFromConfig` after load: leftover process env cannot override effective URLs
- Admin GraphQL no longer returns `env` source or `envVar`
- Secret seeds encrypted at rest; audit redacted

## Follow-ups (explicitly deferred)

- Admin or CLI: `mybike config set|get|delete` for break-glass without Web UI
- Optional admin “Reset setting” (delete row) button
- Revisit whether `BETTER_AUTH_SECRET` could ever move behind encryption (likely never)

## References

- Phase 2 design: `docs/superpowers/specs/2026-07-28-admin-runtime-config-phase-2-design.md`
- Registry: `server/src/lib/settings-registry.ts`
- Config service: `server/src/services/app-config.ts`
- Auth sync: `server/src/lib/runtime-config.ts`
