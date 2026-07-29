# Admin Roles & Runtime Configuration

> **Status: IMPLEMENTED (Phases 1–3 effectively done).** Historical design — keep for architecture/RBAC context.
> **Superseded for precedence / PORT:** live `envOverride` and bootstrap-only `PORT` were replaced by seed-if-absent + `server.port`. See `docs/superpowers/specs/2026-07-29-env-seed-if-absent-design.md` and `docs/admin-runtime-config-migration.md`.

**Date:** 2026-07-27  
**Status:** Approved  
**Context:** After adding secondary OAuth (tsidp), we want durable admin and configuration foundations: in-app settings, hot-reload where possible, restart when not, encrypted secrets, RBAC, and audit.

## Summary

Split configuration into **bootstrap** (`.env`, required to start) and **runtime** (DB-backed overrides editable by admins). Introduce permission-based roles (`admin` / `user`), a seeded bootstrap admin account, a settings registry in code, AES-GCM encryption for secret values, GraphQL admin APIs, and an admin UI. Prefer **hot-reload** for knobs that can change live; for Better Auth / OAuth-style settings, **persist + pending restart + controlled process exit** (Docker restarts the container).

## Goals

- Change logging levels, feature/debug flags, and similar knobs without SSH or hand-editing `.env`
- Provide a foundation that can grow (more settings, OAuth providers in UI, audit, tighter permissions)
- Let admins manage users’ roles from the app
- Encrypt secret runtime values at rest
- Make “what value is actually applied?” obvious when an optional env override is in play
- Keep first implementation focused on **foundation + a small set of migrated settings**, not moving every env var at once

## Non-goals (initial work)

- Editing role or permission **definitions** in the UI (seeded only)
- Hot-reloading Better Auth without process restart
- Managing **strava-webhook-proxy** process config from MyBike admin (separate deploy; stays `.env`)
- First-registered-user auto-promotion to admin
- Automated encryption key rotation tooling (document stub only)
- Conflating GraphQL API-key scopes with user RBAC in v1

## Drivers

| Priority | Driver                                                       |
| -------- | ------------------------------------------------------------ |
| Primary  | Operational convenience (adjust config without file edits)   |
| Primary  | Foundation for growth (clean place for future knobs)         |
| Later    | Multi-admin / compliance polish (roles + audit support this) |

## Decisions

| Topic                  | Choice                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Runtime config storage | DB (`app_settings` key/value), not `config.json` as source of truth                                           |
| Defaults               | Declared in a **code settings registry**; DB stores overrides only                                            |
| Precedence             | Opt-in env override (if declared + set) > DB override > code default                                          |
| Key shape              | Dotted paths; **keyed maps** for collections (`oauth.providers.tsidp.clientId`)                               |
| Ordered lists          | Prefer one JSON array value on a single key; numbered `.0.` paths only when per-item secret/audit is required |
| Bootstrap admin        | Migration seeds `admin@example.com` / `admin123` with `admin` role (idempotent migration)                     |
| Roles                  | Seeded `admin` (all permissions) and `user` (no admin permissions)                                            |
| Admin API              | GraphQL (`admin*` queries/mutations)                                                                          |
| Non-live settings      | Save → `pendingRestart` → `restartServer` → `process.exit(0)` → Docker restart                                |
| Secrets                | AES-256-GCM with bootstrap `CONFIG_ENCRYPTION_KEY`; mask in API/UI                                            |
| Phase 1 settings       | Small sample set proving hot-reload, restart, secret, and env-override paths                                  |

## Architecture

### Two config layers

1. **Bootstrap (`.env` only)** — must exist before DB opens / process binds:
   - `PORT`, `NODE_ENV`
   - `DB_PATH`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SQLITE_IMPORT_PATH`
   - `RUN_MIGRATIONS`, `DRIZZLE_MIGRATIONS_FOLDER`
   - `BETTER_AUTH_SECRET`
   - `CONFIG_ENCRYPTION_KEY` (new)
   - Proxy process vars remain on the proxy host (out of scope)

2. **Runtime (DB + registry)** — everything else that operators may tune:
   - Logging, feature/debug flags, webhook poll interval, public URLs, OAuth provider maps, etc.

### Core components

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Settings registry│────▶│ Config service   │────▶│ Consumers       │
│ (code: schema,   │     │ merge, decrypt,  │     │ get() / onChange│
│  hot vs restart, │     │ env override,    │     │ or restart flag │
│  envOverride?)   │     │ pendingRestart   │     └─────────────────┘
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              app_settings  audit_log    GraphQL admin
              (Turso)                    + Admin UI
```

- **Settings registry** — single source of metadata per key
- **Config service** — load/merge/decrypt; typed accessors; change notifications; restart signaling
- **RBAC** — roles, permissions, user↔role; gate admin GraphQL resolvers
- **Crypto helper** — encrypt/decrypt secret setting values
- **Admin UI** — Configuration, Users, Audit

## Settings inventory & classification

### Bootstrap (stay `.env`)

| Setting                     | Notes                                      |
| --------------------------- | ------------------------------------------ |
| `PORT`                      | Process bind                               |
| `NODE_ENV`                  | Platform                                   |
| `DB_PATH` / Turso URL+token | Required to open config DB                 |
| `SQLITE_IMPORT_PATH`        | One-shot import                            |
| `RUN_MIGRATIONS`            | Docker boot                                |
| `DRIZZLE_MIGRATIONS_FOLDER` | Tooling                                    |
| `BETTER_AUTH_SECRET`        | Auth crypto root; **secret**               |
| `CONFIG_ENCRYPTION_KEY`     | Master key for runtime secrets; **secret** |

### Runtime (target DB) — effect model

| Logical key (suggested)                | Today                             | Effect                         | Secret                  | Env override opt-in |
| -------------------------------------- | --------------------------------- | ------------------------------ | ----------------------- | ------------------- |
| `logging.level`                        | `LOG_LEVEL`                       | Hot-reload (wire Pino level)   | no                      | no (default)        |
| `logging.toFile`                       | `LOG_TO_FILE`                     | Restart (transport built once) | no                      | no                  |
| `logging.filePath`                     | `LOG_FILE_PATH`                   | Restart                        | no                      | no                  |
| `logging.redact`                       | `LOG_REDACT`                      | Restart or hot if rebuilt      | no                      | no                  |
| `graphql.timing`                       | `GRAPHQL_TIMING`                  | Hot (already per-request)      | no                      | no                  |
| `betterAuth.baseUrl`                   | `BETTER_AUTH_URL`                 | Restart                        | no                      | **yes**             |
| `client.url`                           | `CLIENT_URL`                      | Restart                        | no                      | **yes**             |
| `strava.clientId` / `clientSecret` / … | Strava env                        | Restart (Better Auth)          | secret where applicable | optional later      |
| `oauth.providers.<id>.*`               | tsidp / future                    | Restart                        | secrets yes             | optional later      |
| `strava.webhook.proxyUrl`              | `STRAVA_WEBHOOK_PROXY_URL`        | Hot                            | no                      | no                  |
| `strava.webhook.proxyApiKey`           | `STRAVA_WEBHOOK_PROXY_API_KEY`    | Hot                            | **yes**                 | no                  |
| `strava.webhook.subscriptionId`        | `STRAVA_SUBSCRIPTION_ID`          | Hot                            | no                      | no                  |
| `strava.webhook.pollIntervalMs`        | `STRAVA_WEBHOOK_POLL_INTERVAL_MS` | Hot (reschedule)               | no                      | no                  |

### Out of scope (proxy process)

`STRAVA_WEBHOOK_PROXY_PORT`, proxy DB/Turso, `STRAVA_WEBHOOK_PROXY_API_KEY` (on proxy), `STRAVA_VERIFY_TOKEN`, etc. remain proxy `.env`.

## Data model

### `app_settings`

| Column       | Type              | Purpose                                    |
| ------------ | ----------------- | ------------------------------------------ |
| `key`        | text PK           | Stable dotted path                         |
| `value`      | text              | JSON-encoded scalar or small JSON document |
| `is_secret`  | integer/bool      | Encrypt at rest; mask in API               |
| `updated_at` | integer/timestamp | Provenance                                 |
| `updated_by` | text null         | User id who last wrote                     |

Registry in code owns defaults, Zod types, `hotReload` vs `restartRequired`, labels, enums, and optional `envOverride.varName`. DB stores overrides only.

### Key naming

- Scalars: `logging.level`, `client.url`
- Collections: keyed maps — `oauth.providers.tsidp.clientId`, `oauth.providers.strava.clientSecret`
- Avoid `oauth.0.*` for provider sets
- Rare ordered lists: prefer one JSON array on a single key; numbered leaf keys only when per-item secret/audit is required (documented on that registry entry)

### RBAC

- `roles` — seed `admin`, `user`
- `permissions` — string keys (examples below)
- `role_permissions` — mappings (admin → all)
- `user_roles` — user ↔ role

**Seed permissions (v1):**

- `config.read`, `config.write`
- `server.restart`
- `users.read`, `users.assign_role`
- `audit.read`

Phase 1 only **enforces** these on admin surfaces. Normal garage/app behavior for `user` stays as today (session ownership). Finer user-action permissions come later.

### Bootstrap admin user

One-shot migration creates Better Auth user + credential account:

- Email: `admin@example.com`
- Password: `admin123` (stored hashed, Better Auth–compatible)
- Role: `admin`

Existing deployments that receive this user may delete it after promoting a real admin. Migration must be idempotent (skip if user already exists).

### `config_audit_log`

| Column                | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| id                    | PK                                                 |
| actor_user_id         | Who                                                |
| key                   | Setting key (or `role:` / user events if extended) |
| old_value / new_value | Redacted for secrets (`***` / null)                |
| created_at            | When                                               |

## Env override feature

- Only registry entries with `envOverride` participate
- If the named env var is **set** (non-empty), it wins over DB and default
- Admin API returns for each setting: `value` (effective), `source` (`env` \| `database` \| `default`), `envVar?`, `restartRequired`, `pendingRestart` contribution
- When `source === env`: UI shows badge + read-only (or allow DB edit with clear “not applied until env unset”)
- Keep opt-in list small: start with `betterAuth.baseUrl` / `client.url` (and similar deploy URLs later)

## Hot-reload & restart

**Hot-reload:** on successful write, config service updates memory snapshot and calls subscribers (e.g. set log level, reschedule poll interval). Consumers must not cache bootstrap `process.env` for migrated keys.

**Restart-required:** write succeeds; mark pending restart (persist enough state to survive and to show banner); do not apply until process restart.

**Restart mutation:** requires `server.restart`; flush logging; `process.exit(0)`; Docker must use a restart policy such as `unless-stopped` / `always` so the container comes back; boot loads new effective config. Document this in `compose.yaml` / deploy docs when Phase 1 ships.

## Encryption

- Algorithm: AES-256-GCM
- Key: `CONFIG_ENCRYPTION_KEY` (bootstrap); required in production when writing/reading secrets
- Stored envelope includes version byte/field for future rotation (e.g. `{ v: 1, iv, tag, ct }`)
- Decrypt only inside config service for in-memory effective config
- GraphQL never returns plaintext secrets: `isSet`, masked placeholder; write = replace; omit/empty = leave unchanged
- Audit always redacts secret values
- Key rotation: v1 documents manual re-save under new key; automated re-encrypt later

## GraphQL admin surface

Permission-gated resolvers (session auth; fail closed):

**Queries**

- `adminSettings` — grouped effective settings + metadata
- `adminUsers` — users + assigned roles
- `adminConfigAudit` — recent config changes

**Mutations**

- `updateAdminSetting` / `updateAdminSettings`
- `restartServer`
- `assignUserRole`

No separate REST admin API unless a future edge case requires it.

## Admin UI

- Area under Settings or `/admin`: **Configuration**, **Users**, **Audit**
- Configuration: registry-driven controls (enums/dropdowns, booleans, masked secrets), source badges, restart banner + button
- Users: list + role assignment (`admin` ↔ `user`)
- Soft warning if seed admin account still exists (optional polish)

## Phased roadmap

### Phase 1 — Foundation

- RBAC schema + seeds; bootstrap admin migration
- `app_settings` + audit log + crypto helper
- Registry + config service (merge, env override, hot-reload, pending restart)
- `restartServer` mutation
- GraphQL admin + UI (config, users, audit)
- Migrate a **small** set that exercises all paths, for example:
  - `logging.level` (hot)
  - `graphql.timing` (hot)
  - `strava.webhook.pollIntervalMs` (hot)
  - one secret (e.g. `strava.webhook.proxyApiKey`) (encrypt + mask)
  - one restart-required (e.g. `logging.toFile`)
  - env-override demo on `betterAuth.baseUrl` and/or `client.url`

### Phase 2 — More runtime knobs

- Remaining logging fields; MyBike-side webhook proxy client settings
- More subscribers; polish restart UX

### Phase 3 — OAuth / IDP in config

- `oauth.providers.<id>.*` map (Strava, tsidp, …)
- Admin UI to manage providers; apply via restart
- Reduce `.env` dependency for those credentials

### Phase 4 — Harden & extend

- Key rotation helpers; richer audit filters
- Optional proxy admin (separate process) later
- Selective permission checks on more user actions; custom roles only if needed

## Testing (foundation)

- Config merge precedence (default / DB / env override)
- Secret encrypt/decrypt + API masking + audit redaction
- Hot-reload subscriber invoked on update; restart-required does not apply until restart flag path
- Permission denials for `user` role on admin resolvers
- Seed admin + role assignment
- Idempotent migrations

## Open points deferred to implementation plan

- Exact Drizzle table/column types and migration filenames
- Precise GraphQL type names and input shapes
- Whether `pendingRestart` is a DB row, in-memory + last-applied generation, or both
- Exact Phase 1 key list finalization (examples above are normative intent)
- Password-change / force-reset UX for seed admin (optional)

## References

- Current env surface: `.env.example`, `server/src/lib/auth-config.ts`, `logging/src/config.ts`
- OAuth providers: `server/src/lib/tsidp-oauth.ts`, `server/src/lib/oauth-providers.ts`, `server/src/lib/strava-oauth.ts`
- GraphQL auth context: `server/src/graphql/context.ts`
- Deploy: `Dockerfile`, `compose.yaml` (single Node process + volume)
