# Admin Runtime Config — Full Settings Migration (Phase 2)

**Date:** 2026-07-28  
**Status:** Approved  
**Context:** Phase 1 shipped RBAC, `app_settings`, GraphQL admin APIs, encryption, and a sample of seven runtime keys. This phase migrates the remaining MyBike-side runtime settings into the registry and admin UI, splits Strava login OAuth from `/api/strava` integration credentials, and adds a reusable explicit-inherit mechanism.  
**Parent:** `docs/superpowers/specs/2026-07-27-admin-runtime-config-design.md`

## Summary

Complete the MyBike runtime settings surface: finish logging, finish Strava webhook client knobs, add keyed `oauth.providers.<id>.*` for Better Auth login providers, and add `integration.strava.*` for activity-sync OAuth. Use flat dotted registry keys with UI grouping. Support explicit credential inherit (`integration.strava.inheritCredentials`) so operators can share one Strava app between login and sync without duplicating secrets. Document how to migrate values from `.env` into Admin Configuration; do not auto-import env into the DB.

## Goals

- Move all remaining MyBike-side tunable settings into the settings registry + admin UI
- Keep bootstrap and proxy-process configuration in `.env`
- Make OAuth provider keys easy to extend (`oauth.providers.<id>.*`)
- Separate Better Auth Strava login from `/api/strava` sync credentials
- Reusable explicit inherit: when on, own stored values are ignored until inherit is turned off
- Operator docs for env → admin migration and for adding new settings later
- Prefer hot-reload where practical; restart is acceptable for logging transports and Better Auth / integration credential changes

## Non-goals

- Managing **strava-webhook-proxy** process config from MyBike admin
- Boot-time auto-importer that copies all env vars into `app_settings`
- Hot-reloading Better Auth without process restart
- Free-form “add any OAuth provider” without a code registry entry
- Changing RBAC permission model or audit log schema beyond exposing a new `inherited` value source

## Decisions

| Topic                    | Choice                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Key model                | Flat dotted keys; UI groups by prefix                                                        |
| OAuth shape              | `oauth.providers.<id>.{enabled,clientId,clientSecret,…}`                                     |
| Strava split             | Login under `oauth.providers.strava.*`; sync under `integration.strava.*`                    |
| Inherit                  | Explicit boolean toggle; own DB values preserved but ignored while inheriting                |
| OAuth redirect           | No oauth redirect key — Better Auth uses `{betterAuth.baseUrl}/api/auth/callback/<provider>` |
| Sync redirect / scopes   | `integration.strava.redirectUri` and `integration.strava.scopes`                             |
| Logging transport knobs  | Restart-required; wire boot from config (including fixing `logging.toFile`)                  |
| Env → DB                 | Documented manual migrate; no automatic importer                                             |
| Unofficial env fallbacks | Remove for migrated keys; only declared `envOverride`s participate                           |

## Architecture

### Layers (unchanged)

1. **Bootstrap (`.env` only)** — process bind, DB/Turso, `BETTER_AUTH_SECRET`, `CONFIG_ENCRYPTION_KEY`, migration tooling
2. **Runtime (registry + DB)** — everything else operators may tune from Admin → Configuration
3. **Proxy process (`.env` on proxy host)** — out of scope

### Inherit resolution

Registry metadata on inheritable leaves:

- `inheritWhen`: key of a boolean setting (e.g. `integration.strava.inheritCredentials`)
- `inheritFrom`: key of the source setting (e.g. `oauth.providers.strava.clientId`)

Effective value for an inheritable leaf:

1. If `inheritWhen` resolves to `true` → use source key’s effective value; report `source: "inherited"`
2. Else normal precedence: opt-in env override (if declared and set) > DB override > code default

While inheriting:

- Admin UI shows inherited value (masked if secret), read-only, badge `inherited`
- Writes to the leaf are rejected with a clear error
- Stored own DB value remains until inherit is turned off; then own value (or default) becomes effective again

Default: `integration.strava.inheritCredentials = true`.

First inherit pairs:

| Leaf                              | Source when inherit on                |
| --------------------------------- | ------------------------------------- |
| `integration.strava.clientId`     | `oauth.providers.strava.clientId`     |
| `integration.strava.clientSecret` | `oauth.providers.strava.clientSecret` |

The mechanism is generic for future non-Strava inherits; only these pairs ship in this phase.

### Value sources

Extend `SettingValueSource` with `"inherited"`:

`env` | `database` | `default` | `inherited`

### Effects

| Area                                                                                        | Effect                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `logging.level`, `graphql.timing`, `strava.webhook.*` (poll, api key, url, subscription id) | Hot-reload                                                           |
| `logging.toFile`, `logging.filePath`, `logging.redact`                                      | Restart-required; apply from config on boot                          |
| `oauth.providers.*`                                                                         | Restart-required (Better Auth built at process start)                |
| `integration.strava.*`                                                                      | Restart-required (credentials / authorize URL / client module state) |
| `betterAuth.baseUrl`, `client.url`                                                          | Restart-required (existing)                                          |

## Settings inventory

### Bootstrap — stay `.env`

`PORT`, `NODE_ENV`, `DB_PATH`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SQLITE_IMPORT_PATH`, `RUN_MIGRATIONS`, `DRIZZLE_MIGRATIONS_FOLDER`, `BETTER_AUTH_SECRET`, `CONFIG_ENCRYPTION_KEY`

### Already in registry (keep; fix `logging.toFile` wiring)

| Key                             | Legacy env                        | Effect  | Secret | Env override |
| ------------------------------- | --------------------------------- | ------- | ------ | ------------ |
| `logging.level`                 | `LOG_LEVEL`                       | hot     | no     | no           |
| `logging.toFile`                | `LOG_TO_FILE`                     | restart | no     | no           |
| `graphql.timing`                | `GRAPHQL_TIMING`                  | hot     | no     | no           |
| `strava.webhook.pollIntervalMs` | `STRAVA_WEBHOOK_POLL_INTERVAL_MS` | hot     | no     | no           |
| `strava.webhook.proxyApiKey`    | `STRAVA_WEBHOOK_PROXY_API_KEY`    | hot     | yes    | no           |
| `betterAuth.baseUrl`            | `BETTER_AUTH_URL`                 | restart | no     | yes          |
| `client.url`                    | `CLIENT_URL`                      | restart | no     | yes          |

### New — logging

| Key                | Legacy env      | Effect  | Secret |
| ------------------ | --------------- | ------- | ------ |
| `logging.filePath` | `LOG_FILE_PATH` | restart | no     |
| `logging.redact`   | `LOG_REDACT`    | restart | no     |

### New — Strava webhook client (MyBike → proxy)

| Key                             | Legacy env                 | Effect | Secret |
| ------------------------------- | -------------------------- | ------ | ------ |
| `strava.webhook.proxyUrl`       | `STRAVA_WEBHOOK_PROXY_URL` | hot    | no     |
| `strava.webhook.subscriptionId` | `STRAVA_SUBSCRIPTION_ID`   | hot    | no     |

### New — OAuth providers (Better Auth login)

| Key                                   | Legacy env              | Effect  | Secret | Notes                                    |
| ------------------------------------- | ----------------------- | ------- | ------ | ---------------------------------------- |
| `oauth.providers.tsidp.enabled`       | _(new)_                 | restart | no     | Default `false`; enable when using tsidp |
| `oauth.providers.tsidp.clientId`      | `TSIDP_CLIENT_ID`       | restart | no     |                                          |
| `oauth.providers.tsidp.clientSecret`  | `TSIDP_CLIENT_SECRET`   | restart | yes    |                                          |
| `oauth.providers.tsidp.issuer`        | `TSIDP_ISSUER`          | restart | no     |                                          |
| `oauth.providers.tsidp.scopes`        | `TSIDP_SCOPES`          | restart | no     | Default `openid profile email`           |
| `oauth.providers.strava.enabled`      | _(new)_                 | restart | no     | Default `false`                          |
| `oauth.providers.strava.clientId`     | `STRAVA_CLIENT_ID`      | restart | no     | Login only                               |
| `oauth.providers.strava.clientSecret` | `STRAVA_CLIENT_SECRET`  | restart | yes    | Login only                               |
| `oauth.providers.strava.scopes`       | `STRAVA_SCOPES` (login) | restart | no     | Default current login scopes             |

Provider is registered with Better Auth only when `enabled === true` **and** required fields are set.

### New — Integration Strava (`/api/strava` sync)

| Key                                     | Legacy env             | Effect  | Secret | Notes                    |
| --------------------------------------- | ---------------------- | ------- | ------ | ------------------------ |
| `integration.strava.enabled`            | _(new)_                | restart | no     | Default `false`          |
| `integration.strava.inheritCredentials` | _(new)_                | restart | no     | Default `true`           |
| `integration.strava.clientId`           | `STRAVA_CLIENT_ID`     | restart | no     | Ignored while inheriting |
| `integration.strava.clientSecret`       | `STRAVA_CLIENT_SECRET` | restart | yes    | Ignored while inheriting |
| `integration.strava.redirectUri`        | `STRAVA_REDIRECT_URI`  | restart | no     | Sync callback            |
| `integration.strava.scopes`             | `STRAVA_SCOPES` (sync) | restart | no     | Sync authorize URL       |

Sync paths use **resolved** integration credentials (after inherit). Redirect and scopes always come from integration keys (not oauth).

### Out of scope — proxy process

`STRAVA_WEBHOOK_PROXY_PORT`, proxy DB/Turso vars, proxy-side `STRAVA_WEBHOOK_PROXY_API_KEY`, `STRAVA_VERIFY_TOKEN`, `STRAVA_WEBHOOK_CALLBACK_URL`

## Consumers

| Consumer                                 | Behavior                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Logging package / server boot            | Read `logging.*` from config snapshot on boot; apply level hot via existing subscriber; remove reliance on `LOG_*` for migrated keys |
| GraphQL timing                           | Config only (drop undocumented `GRAPHQL_TIMING` fallback)                                                                            |
| Webhook poller / event source            | `proxyUrl`, `proxyApiKey`, `pollIntervalMs`, `subscriptionId` from config; recreate/reschedule on hot change                         |
| `oauth-providers` / tsidp / strava-oauth | Build from `oauth.providers.*`; gate on `enabled`                                                                                    |
| `strava-client` / `/api/strava` routes   | Use resolved `integration.strava.*`                                                                                                  |

## Admin UI

- Group by: Logging, GraphQL, Strava webhook, Authentication, OAuth (tsidp / strava), Integration (Strava)
- Inherit toggle on Integration → Strava credentials
- When inherit on: credential fields read-only with `inherited` badge; secrets masked
- Existing source badges, save draft, restart banner unchanged
- Descriptions on all new registry entries

## Operator documentation

Add `docs/admin-runtime-config-migration.md` covering:

1. Bootstrap vs runtime vs proxy split
2. Legacy env → registry key map (this inventory)
3. How to migrate a running deploy (set encryption key, paste into Admin UI, restart, remove migrated `.env` entries except intentional overrides)
4. Strava login vs sync split and inherit behavior
5. Developer checklist for adding a new setting (shared key, registry definition, consumer, effect, optional inherit/envOverride, UI group, tests)

Update `.env.example` comments to point migrated knobs at Admin Configuration.

## Testing

- Inherit on/off: effective value, stored own secret ignored, write rejected while inheriting
- OAuth: disabled excludes provider; enabled requires credentials
- Integration uses oauth credentials when inheriting; own when not
- Logging `toFile` / `filePath` / `redact` applied after restart from config
- Webhook `proxyUrl` / `subscriptionId` hot path
- Precedence: declared env override > DB > default; inherit short-circuits own DB
- Secrets masked in GraphQL/audit; encrypt at rest

## Implementation order (guidance for plan)

1. Extend shared sources + registry inherit metadata; resolve `inherited` in config service
2. Complete logging keys + wire boot (`toFile` fix)
3. Webhook `proxyUrl` + `subscriptionId`
4. OAuth provider keys + restart consumers
5. Integration Strava keys + inherit wiring
6. Admin UI grouping + inherit UX
7. Migration docs + `.env.example`

## Defaults for new `enabled` flags

`oauth.providers.*.enabled` and `integration.strava.enabled` default to **`false`**. Operators turn them on in Admin when configuring that feature. No boot-time inference from legacy env (avoids surprising login/sync activation after upgrade). Migration docs tell operators to enable after pasting credentials.

## Open points deferred to implementation plan

- Exact GraphQL field additions for inherit metadata (`inheritWhen`, `inheritFrom`, read-only while inheriting)
- Logging `filePath` empty-string-means-package-default vs concrete default string in the registry

## References

- Parent design: `docs/superpowers/specs/2026-07-27-admin-runtime-config-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-07-27-admin-runtime-config-phase-1.md`
- Registry: `server/src/lib/settings-registry.ts`
- Shared keys: `shared/src/schemas/app-settings.ts`
- OAuth: `server/src/lib/oauth-providers.ts`, `tsidp-oauth.ts`, `strava-oauth.ts`
- Sync: `server/src/lib/strava-client.ts`, `server/src/routes/strava.ts`
- Logging: `logging/src/config.ts`
