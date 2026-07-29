# Admin runtime config — migrating from `.env`

This guide explains how MyBike splits configuration across bootstrap env vars, database-backed runtime settings, and the separate **strava-webhook-proxy** process. It maps legacy `.env` keys to the admin settings registry and walks through upgrading a running deployment.

**UI:** Settings → Admin → Configuration (`/settings/admin/configuration`)

## 1. Bootstrap vs runtime vs proxy

MyBike uses three configuration layers:

| Layer             | Where it lives                              | Who edits it                     | Examples                                                                                             |
| ----------------- | ------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Bootstrap**     | `.env` only                                 | Operator / deploy tooling        | `DB_PATH`, `TURSO_*`, `BETTER_AUTH_SECRET`, `CONFIG_ENCRYPTION_KEY`, migration tooling               |
| **Runtime**       | Settings registry + `app_settings` DB table | Admin UI (or GraphQL admin APIs) | Port, logging, GraphQL timing, Strava webhook client, OAuth providers, Strava integration, auth URLs |
| **Proxy process** | `.env` on the **strava-webhook-proxy** host | Operator on that host            | Proxy port, proxy DB/Turso, `STRAVA_VERIFY_TOKEN`, `STRAVA_WEBHOOK_CALLBACK_URL`, proxy-side API key |

**Bootstrap** values are read once at process start and are required before the server can open the database or decrypt stored secrets. They are **not** editable from the admin UI.

**Runtime** values live in the registry (`server/src/lib/settings-registry.ts`). On boot, if a registry key has `seedFromEnv` and the matching `app_settings` row is missing, a non-empty env value is written into the DB once. After that, Admin → Configuration owns the value. Secrets are encrypted at rest using `CONFIG_ENCRYPTION_KEY`.

**Proxy** settings configure the public webhook relay. MyBike only needs the **client-side** webhook knobs (`strava.webhook.*`) to pull events from the proxy; proxy-server config stays on the proxy host.

### Value precedence (runtime)

For each registry key:

1. **Inherit** — when declared (`inheritWhen` / `inheritFrom`), short-circuits own DB values (see [§4](#4-strava-login-vs-sync--inherit))
2. **Database override** — value saved in Admin Configuration (including rows created by seed-if-absent)
3. **Code default** — from the registry definition

Env vars do **not** win at runtime. They only seed missing rows.

If env remains set while a row already exists, the server logs a non-fatal warning and ignores the env value:

> `{VAR} is set in the environment but {key} already exists in app_settings; the env value is ignored. Remove {VAR} from .env to avoid accidental re-seed if the database row is deleted.`

**Reset:** delete the `app_settings` row for that key. On the next boot, if the seed env var is still set, the row is re-created from env.

### Hot reload vs restart

| Effect               | When it applies                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Hot reload**       | Change takes effect without restart (e.g. `logging.level`, `graphql.timing`, most `strava.webhook.*`)                        |
| **Restart required** | Process must restart (e.g. `server.port`, logging file transport, OAuth providers, Strava integration, `betterAuth.baseUrl`) |

The admin UI shows a restart banner when restart-required settings change.

---

## 2. Legacy env → registry key map

### Bootstrap — stay in `.env`

These are **not** migrated to the admin UI:

| Env var                     | Purpose                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                  | Node environment                                                     |
| `DB_PATH`                   | Local Turso Database file path                                       |
| `TURSO_DATABASE_URL`        | Turso Cloud database URL                                             |
| `TURSO_AUTH_TOKEN`          | Turso Cloud auth token                                               |
| `SQLITE_IMPORT_PATH`        | One-time local file import source                                    |
| `RUN_MIGRATIONS`            | Run migrations on boot                                               |
| `DRIZZLE_MIGRATIONS_FOLDER` | Migrations folder override                                           |
| `BETTER_AUTH_SECRET`        | Session signing secret                                               |
| `CONFIG_ENCRYPTION_KEY`     | Encrypts DB-stored secrets (generate with `openssl rand -base64 32`) |

### Runtime — seed-if-absent then Admin Configuration

| Registry key                            | Seed env                          | Effect  | Secret | Notes                                    |
| --------------------------------------- | --------------------------------- | ------- | ------ | ---------------------------------------- |
| `server.port`                           | `PORT`                            | restart | no     | Listen port after config load            |
| `logging.level`                         | `LOG_LEVEL`                       | hot     | no     |                                          |
| `logging.toFile`                        | `LOG_TO_FILE`                     | restart | no     |                                          |
| `logging.filePath`                      | `LOG_FILE_PATH`                   | restart | no     |                                          |
| `logging.redact`                        | `LOG_REDACT`                      | restart | no     |                                          |
| `graphql.timing`                        | `GRAPHQL_TIMING`                  | hot     | no     |                                          |
| `strava.webhook.pollIntervalMs`         | `STRAVA_WEBHOOK_POLL_INTERVAL_MS` | hot     | no     |                                          |
| `strava.webhook.proxyApiKey`            | `STRAVA_WEBHOOK_PROXY_API_KEY`    | hot     | yes    |                                          |
| `strava.webhook.proxyUrl`               | `STRAVA_WEBHOOK_PROXY_URL`        | hot     | no     |                                          |
| `strava.webhook.subscriptionId`         | `STRAVA_SUBSCRIPTION_ID`          | hot     | no     |                                          |
| `betterAuth.baseUrl`                    | `BETTER_AUTH_URL`                 | restart | no     | Editable in UI after seed                |
| `client.url`                            | `CLIENT_URL`                      | restart | no     | Editable in UI after seed                |
| `oauth.providers.tsidp.enabled`         | _(none)_                          | restart | no     | Explicit enable; default `false`         |
| `oauth.providers.tsidp.clientId`        | `TSIDP_CLIENT_ID`                 | restart | no     |                                          |
| `oauth.providers.tsidp.clientSecret`    | `TSIDP_CLIENT_SECRET`             | restart | yes    |                                          |
| `oauth.providers.tsidp.issuer`          | `TSIDP_ISSUER`                    | restart | no     |                                          |
| `oauth.providers.tsidp.scopes`          | `TSIDP_SCOPES`                    | restart | no     |                                          |
| `oauth.providers.strava.enabled`        | _(none)_                          | restart | no     | Explicit enable; default `false`         |
| `oauth.providers.strava.clientId`       | `STRAVA_CLIENT_ID`                | restart | no     |                                          |
| `oauth.providers.strava.clientSecret`   | `STRAVA_CLIENT_SECRET`            | restart | yes    |                                          |
| `oauth.providers.strava.scopes`         | `STRAVA_SCOPES` (login)           | restart | no     |                                          |
| `integration.strava.enabled`            | _(none)_                          | restart | no     | Explicit enable; default `false`         |
| `integration.strava.inheritCredentials` | _(none)_                          | restart | no     | Default `true`; not seeded               |
| `integration.strava.clientId`           | `STRAVA_CLIENT_ID`                | restart | no     | Same seed env as OAuth when both missing |
| `integration.strava.clientSecret`       | `STRAVA_CLIENT_SECRET`            | restart | yes    |                                          |
| `integration.strava.redirectUri`        | `STRAVA_REDIRECT_URI`             | restart | no     |                                          |
| `integration.strava.scopes`             | `STRAVA_SCOPES` (sync)            | restart | no     |                                          |

**Notes:**

- `oauth.providers.*.enabled` and `integration.strava.enabled` default to **`false`**. Turn them on in Admin after credentials exist — the server does not infer enabled state from seeded env.
- Shared Strava client id/secret/scopes may seed **both** oauth and integration rows on first boot when both rows are missing; inherit still applies at read time when `inheritCredentials` is true.
- OAuth redirect URIs are **not** stored in the registry. Better Auth uses `{betterAuth.baseUrl}/api/auth/callback/<provider>` automatically.

### Out of scope — proxy process (stay on proxy host `.env`)

| Env var                        | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `STRAVA_WEBHOOK_PROXY_PORT`    | Proxy listen port                                                  |
| `STRAVA_WEBHOOK_PROXY_DB_PATH` | Proxy local DB path                                                |
| `STRAVA_WEBHOOK_PROXY_TURSO_*` | Proxy Turso Cloud                                                  |
| `STRAVA_WEBHOOK_PROXY_API_KEY` | Key the proxy validates (MyBike uses `strava.webhook.proxyApiKey`) |
| `STRAVA_VERIFY_TOKEN`          | Strava webhook verification                                        |
| `STRAVA_WEBHOOK_CALLBACK_URL`  | Public callback URL registered with Strava                         |

---

## 3. Deploy migration steps

Use this checklist when upgrading a deployment that still has runtime values in `.env`.

### Before you start

1. Ensure `CONFIG_ENCRYPTION_KEY` is set in `.env` (required before saving any secret in Admin Configuration).
2. Run database migrations: `npm run -w server db:migrate`.
3. Sign in as an admin (bootstrap user `admin@example.com` / `admin123` until you promote a real admin).

### Migrate values

4. **Boot once with legacy env still set.** Missing `app_settings` rows are seeded automatically from the map in [§2](#2-legacy-env--registry-key-map).
5. Open **Settings → Admin → Configuration** and confirm seeded values (or paste/adjust any gaps).
6. **Enable feature flags** where needed:
   - OAuth providers: set `oauth.providers.<id>.enabled` to **true** when credentials are complete.
   - Strava sync: set `integration.strava.enabled` to **true** when integration credentials and redirect URI are set.
7. For Strava, configure **OAuth · Strava** (login) and **Integration · Strava** (sync) separately — see [§4](#4-strava-login-vs-sync--inherit).

### Apply and clean up

8. **Restart** the MyBike server if any restart-required settings changed (port, OAuth, integration, logging file transport, auth URLs). Hot-reload settings apply without restart.
9. Verify behavior: listen port, logging level, Strava login, activity sync, webhook polling.
10. **Remove seeded keys from `.env`** on the MyBike server. Keep bootstrap vars only. Leaving seed env vars set after rows exist produces leftover-env warnings and risks accidental re-seed if a row is deleted.
11. Leave proxy-host env vars on the **strava-webhook-proxy** deployment unchanged.

### Rollback / reset a single setting

Delete the `app_settings` row for that key (SQL today; CLI deferred). On the next boot, if the seed env var is present, the row is re-seeded. Otherwise the code default applies until you set a new value in Admin.

---

## 4. Strava login vs sync + inherit

Strava is split into two independent configuration areas:

| Area                     | Registry prefix            | Purpose                           | Callback                                                                               |
| ------------------------ | -------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| **OAuth · Strava**       | `oauth.providers.strava.*` | Better Auth login / sign-up       | `{betterAuth.baseUrl}/api/auth/callback/strava`                                        |
| **Integration · Strava** | `integration.strava.*`     | `/api/strava` activity sync OAuth | `integration.strava.redirectUri` (default `http://localhost:3001/api/strava/callback`) |

Register **both** callback URLs in your Strava API application if you use login and sync.

### Credential inherit

`integration.strava.inheritCredentials` defaults to **`true`**. When on:

- `integration.strava.clientId` and `integration.strava.clientSecret` **inherit** from `oauth.providers.strava.clientId` / `clientSecret`.
- The admin UI shows inherited values read-only with an **inherited** badge; secrets are masked.
- Writes to integration credentials are rejected while inherit is on.
- Your own stored integration credential values remain in the DB but are ignored until you turn inherit off.

When inherit is **off**, integration uses its own stored client ID and secret.

**Always from integration keys (never inherited):** `integration.strava.redirectUri` and `integration.strava.scopes` — sync authorize URL and scopes come from integration settings only.

### Typical setups

| Setup                        | OAuth · Strava            | Integration · Strava                                 |
| ---------------------------- | ------------------------- | ---------------------------------------------------- |
| Login + sync, one Strava app | Enable, paste credentials | Enable, leave **Use OAuth credentials** on           |
| Sync only, separate app      | Disabled or unused        | Enable, turn inherit **off**, paste sync credentials |
| Login only                   | Enable, paste credentials | Leave disabled                                       |

Legacy `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` map to **both** oauth and integration keys in the table above; after migration, configure oauth once and use inherit for sync when sharing one app.

---

## 5. Developer checklist — adding a new setting

When introducing a new runtime knob:

1. **Shared key** — Add to `APP_SETTING_KEYS` in `shared/src/schemas/app-settings.ts`.
2. **Registry definition** — Add entry in `server/src/lib/settings-registry.ts` with `schema`, `defaultValue`, `effect` (`hotReload` | `restartRequired`), `secret`, `group`, `label`, `description`.
3. **Optional metadata**
   - `seedFromEnv: { varName: "...", parse? }` to seed missing rows from env on boot (not a live override).
   - `inheritWhen` / `inheritFrom` for inheritable credential leaves.
4. **Consumer** — Read via config service snapshot; wire hot-reload subscriber or restart-only boot path as appropriate.
5. **GraphQL** — Admin types expose the key automatically from the registry; add tests if behavior is non-trivial (inherit, precedence, masking).
6. **UI** — New keys appear under their `group` in Admin → Configuration; add inherit UX if applicable.
7. **Docs** — Update this file’s env map and `.env.example` comments if the setting replaces a legacy env var.
8. **Tests** — `server/src/test/` for precedence, seed-if-absent, inherit, secret encryption, and consumer wiring.

**Do not** add live env overrides (`envOverride` is gone). Prefer seed-if-absent for first-boot convenience, then Admin Configuration as source of truth.

### Reference files

| File                                                                       | Role                                                                               |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `shared/src/schemas/app-settings.ts`                                       | Key list and shared types                                                          |
| `server/src/lib/settings-registry.ts`                                      | Definitions, defaults, `seedFromEnv`                                               |
| `server/src/services/app-config.ts`                                        | Load, seed, resolve, encrypt, inherit                                              |
| `client/src/features/admin/ConfigurationPage.tsx`                          | Admin UI                                                                           |
| `docs/superpowers/specs/2026-07-29-env-seed-if-absent-design.md`           | Seed-if-absent design-of-record (current precedence)                               |
| `docs/superpowers/specs/2026-07-28-admin-runtime-config-phase-2-design.md` | Historical Phase 2 design (OAuth/inherit); precedence superseded by seed-if-absent |
