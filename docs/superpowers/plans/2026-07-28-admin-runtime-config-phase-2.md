# Admin Runtime Config — Phase 2 Full Settings Migration

> **Status: COMPLETE (implemented on this branch).** Do not re-execute unchecked task boxes.
> Live `envOverride` / `source: "env"` in this plan was later replaced by seed-if-absent — see `docs/superpowers/specs/2026-07-29-env-seed-if-absent-design.md` and `docs/admin-runtime-config-migration.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all remaining MyBike-side runtime settings into the registry and admin UI, add reusable explicit inherit for Strava integration credentials, wire consumers (logging, webhook, OAuth login, `/api/strava` sync), and document env → admin migration.

**Architecture:** Flat dotted keys in `APP_SETTING_KEYS` + `SETTINGS_REGISTRY`. Config resolve order: inherit (when toggle on) → declared env override → DB → default. New source `"inherited"`. OAuth login under `oauth.providers.<id>.*`; sync under `integration.strava.*` with `inheritCredentials`. Logging transport knobs apply on boot via env sync **before** logger init. Better Auth / integration credential changes remain restart-required.

**Spec:** `docs/superpowers/specs/2026-07-28-admin-runtime-config-phase-2-design.md`

**Tech Stack:** Existing app-config + settings registry, shared Zod enums, Pothos GraphQL, Better Auth genericOAuth, logging package, React admin Configuration page, Vite+ tests.

## Global Constraints

- Precedence: inherit (if `inheritWhen` true) > opt-in env override > DB > default.
- Bootstrap-only (never migrate): `PORT`, `NODE_ENV`, DB/Turso, `RUN_MIGRATIONS`, `DRIZZLE_MIGRATIONS_FOLDER`, `BETTER_AUTH_SECRET`, `CONFIG_ENCRYPTION_KEY`.
- Proxy-process env stays out of scope.
- No boot-time bulk env → `app_settings` importer.
- `oauth.providers.*.enabled` and `integration.strava.enabled` default **`false`**.
- `integration.strava.inheritCredentials` default **`true`**.
- `logging.filePath` default `""` — empty means package `defaultLogFilePath`.
- Drop undocumented env fallbacks for migrated keys (`GRAPHQL_TIMING`, raw webhook API key / URL / subscription id once wired).
- Only declared `envOverride`s participate (`BETTER_AUTH_URL`, `CLIENT_URL` only unless this plan adds more — it does not).
- After `shared` changes: `npm run -w shared build` before server/client tests.
- Prefer `npm run verify` before considering the branch done.

## Locked design choices

| Topic                  | Choice                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| GraphQL inherit fields | On `AdminSetting`: `readOnly: Boolean!`, `inheritWhen: String`, `inheritFrom: String`          |
| `readOnly`             | `true` when `source === "env"` or `source === "inherited"`                                     |
| `inherited` source     | Add to `SETTING_VALUE_SOURCES` and GraphQL `AdminSettingSource`                                |
| Logger boot            | `syncLoggingEnvFromConfig` then `initLogging()` after `appConfig.load()` (lazy logging module) |

## File map

| File                                                                   | Responsibility                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `shared/src/schemas/app-settings.ts`                                   | All keys + `inherited` source                                        |
| `shared/src/schemas.test.ts`                                           | Key/source expectations                                              |
| `server/src/lib/settings-registry.ts`                                  | Definitions, `inheritWhen` / `inheritFrom`, groups                   |
| `server/src/services/app-config.ts`                                    | Inherit resolve; reject writes while inheriting; expose inherit meta |
| `server/src/graphql/schema/admin.ts`                                   | Source enum + `readOnly` / inherit fields                            |
| `server/src/lib/runtime-config.ts`                                     | `syncLoggingEnvFromConfig`                                           |
| `server/src/lib/logging/index.ts`                                      | Lazy `initLogging()` after env sync                                  |
| `logging/src/config.ts`                                                | Honor synced `LOG_*`; empty `LOG_FILE_PATH` → package default        |
| `server/src/graphql/request-timing.ts`                                 | Config only (no env fallback)                                        |
| `server/src/lib/strava-event-source.ts`                                | `proxyUrl` + api key from config                                     |
| `server/src/lib/strava-webhook-processor.ts`                           | `subscriptionId` from config                                         |
| `server/src/lib/strava-webhook-poller.ts`                              | Refresh on url/key changes (existing pattern)                        |
| `server/src/index.ts`                                                  | Boot order; subscribe `proxyUrl` / `subscriptionId`                  |
| `server/src/lib/tsidp-oauth.ts`                                        | Read from config / injectable config bag                             |
| `server/src/lib/strava-oauth.ts`                                       | Login provider from `oauth.providers.strava.*`                       |
| `server/src/lib/oauth-providers.ts`                                    | Gate on `enabled` + required fields                                  |
| `server/src/lib/strava-client.ts`                                      | Resolved `integration.strava.*`                                      |
| `server/src/routes/strava.ts`                                          | Use integration helpers; respect `enabled`                           |
| `client/src/lib/graphql/operations.ts`                                 | Types + query fields                                                 |
| `client/src/features/admin/ConfigurationPage.tsx`                      | `inherited` badge; `readOnly`; inherit UX                            |
| `docs/admin-runtime-config-migration.md`                               | Operator + developer migration guide                                 |
| `.env.example`                                                         | Point migrated knobs at Admin UI                                     |
| `server/src/test/admin-config.test.ts`                                 | Inherit + new keys                                                   |
| `server/src/test/runtime-config.test.ts` / new oauth-integration tests | Consumers                                                            |

---

### Task 1: Shared keys + `inherited` source

**Files:**

- Modify: `shared/src/schemas/app-settings.ts`
- Modify: `shared/src/schemas.test.ts`
- Test: `shared/src/schemas.test.ts`

**Interfaces:**

- Produces: full `APP_SETTING_KEYS` list (order must match registry later):

```ts
export const APP_SETTING_KEYS = [
  "logging.level",
  "logging.toFile",
  "logging.filePath",
  "logging.redact",
  "graphql.timing",
  "strava.webhook.pollIntervalMs",
  "strava.webhook.proxyApiKey",
  "strava.webhook.proxyUrl",
  "strava.webhook.subscriptionId",
  "betterAuth.baseUrl",
  "client.url",
  "oauth.providers.tsidp.enabled",
  "oauth.providers.tsidp.clientId",
  "oauth.providers.tsidp.clientSecret",
  "oauth.providers.tsidp.issuer",
  "oauth.providers.tsidp.scopes",
  "oauth.providers.strava.enabled",
  "oauth.providers.strava.clientId",
  "oauth.providers.strava.clientSecret",
  "oauth.providers.strava.scopes",
  "integration.strava.enabled",
  "integration.strava.inheritCredentials",
  "integration.strava.clientId",
  "integration.strava.clientSecret",
  "integration.strava.redirectUri",
  "integration.strava.scopes",
] as const;

export const SETTING_VALUE_SOURCES = ["env", "database", "default", "inherited"] as const;
```

- [ ] **Step 1: Write failing test** — expect `APP_SETTING_KEYS` length `26` and sources include `"inherited"`.

- [ ] **Step 2: Update `app-settings.ts` to the lists above.**

- [ ] **Step 3: Run `npm run -w shared test` and `npm run -w shared build` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add shared/src/schemas/app-settings.ts shared/src/schemas.test.ts
git commit -m "feat(shared): expand app setting keys and add inherited source"
```

---

### Task 2: Registry definitions + inherit metadata

**Files:**

- Modify: `server/src/lib/settings-registry.ts`
- Modify: `server/src/test/admin-config.test.ts` (registry shape assertions)

**Interfaces:**

- Extend `SettingDefinition`:

```ts
export type SettingDefinition<T = unknown> = {
  key: AppSettingKey;
  schema: ZodType<T>;
  defaultValue: T;
  effect: SettingEffect;
  secret?: boolean;
  envOverride?: { varName: string };
  inheritWhen?: AppSettingKey;
  inheritFrom?: AppSettingKey;
  group: string;
  label: string;
  description: string;
};
```

- Defaults / groups (normative):

| Key                                     | default                                       | effect          | secret | inherit                                               | group                |
| --------------------------------------- | --------------------------------------------- | --------------- | ------ | ----------------------------------------------------- | -------------------- |
| `logging.filePath`                      | `""`                                          | restartRequired | no     | —                                                     | Logging              |
| `logging.redact`                        | `true`                                        | restartRequired | no     | —                                                     | Logging              |
| `strava.webhook.proxyUrl`               | `""`                                          | hotReload       | no     | —                                                     | Strava webhook       |
| `strava.webhook.subscriptionId`         | `""`                                          | hotReload       | no     | —                                                     | Strava webhook       |
| `oauth.providers.tsidp.enabled`         | `false`                                       | restartRequired | no     | —                                                     | OAuth · tsidp        |
| `oauth.providers.tsidp.clientId`        | `""`                                          | restartRequired | no     | —                                                     | OAuth · tsidp        |
| `oauth.providers.tsidp.clientSecret`    | `""`                                          | restartRequired | yes    | —                                                     | OAuth · tsidp        |
| `oauth.providers.tsidp.issuer`          | `""`                                          | restartRequired | no     | —                                                     | OAuth · tsidp        |
| `oauth.providers.tsidp.scopes`          | `"openid profile email"`                      | restartRequired | no     | —                                                     | OAuth · tsidp        |
| `oauth.providers.strava.enabled`        | `false`                                       | restartRequired | no     | —                                                     | OAuth · Strava       |
| `oauth.providers.strava.clientId`       | `""`                                          | restartRequired | no     | —                                                     | OAuth · Strava       |
| `oauth.providers.strava.clientSecret`   | `""`                                          | restartRequired | yes    | —                                                     | OAuth · Strava       |
| `oauth.providers.strava.scopes`         | `"read,activity:read_all,profile:read_all"`   | restartRequired | no     | —                                                     | OAuth · Strava       |
| `integration.strava.enabled`            | `false`                                       | restartRequired | no     | —                                                     | Integration · Strava |
| `integration.strava.inheritCredentials` | `true`                                        | restartRequired | no     | —                                                     | Integration · Strava |
| `integration.strava.clientId`           | `""`                                          | restartRequired | no     | inheritWhen `inheritCredentials`, from oauth clientId | Integration · Strava |
| `integration.strava.clientSecret`       | `""`                                          | restartRequired | yes    | same → oauth secret                                   | Integration · Strava |
| `integration.strava.redirectUri`        | `"http://localhost:3001/api/strava/callback"` | restartRequired | no     | —                                                     | Integration · Strava |
| `integration.strava.scopes`             | `"read,activity:read_all,profile:read_all"`   | restartRequired | no     | —                                                     | Integration · Strava |

Keep existing seven keys’ behavior; reorder `settingDefinitions` to match `APP_SETTING_KEYS` exactly (throw if mismatch — already present).

Schemas: booleans via `z.boolean()`; strings via `z.string()` (allow empty where default `""`); urls for `proxyUrl` / `redirectUri` / issuer — use `z.union([z.literal(""), z.string().url()])` so empty default validates.

- [ ] **Step 1: Extend registry type + add all definitions; fix order vs `APP_SETTING_KEYS`.**

- [ ] **Step 2: Update admin-config registry test to assert inherit meta on integration clientId/secret and new key count.**

- [ ] **Step 3: `npm run -w shared build && npm run -w server test -- src/test/admin-config.test.ts` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/settings-registry.ts server/src/test/admin-config.test.ts
git commit -m "feat(server): register Phase 2 settings with inherit metadata"
```

---

### Task 3: Config service inherit resolution + write guards

**Files:**

- Modify: `server/src/services/app-config.ts`
- Modify: `server/src/test/admin-config.test.ts`

**Interfaces:**

- `EffectiveSetting` adds:

```ts
readOnly: boolean;
inheritWhen?: string;
inheritFrom?: string;
```

- `resolveSetting` becomes two-phase inside `computeEffective`:
  1. Resolve every key without inherit (env > DB > default) into a map
  2. For each definition with `inheritWhen` + `inheritFrom`: if toggle value is `true`, set leaf value/source from source key and `source: "inherited"`

- `set` / `setMany`: if target has inherit meta and current effective toggle is true, throw:

```ts
throw new Error(
  `Cannot update ${knownKey} while ${definition.inheritWhen} is enabled; disable inherit first`,
);
```

Evaluate inherit toggle from the **pre-update** effective map (or from prepared updates if the same batch also flips the toggle — if batch sets `inheritCredentials` to `false` and `clientId` together, allow clientId write). Rule:

1. Determine post-batch inherit flag for each leaf: if batch includes `inheritWhen` key, use that new value; else use current effective.
2. If post-batch inherit is `true` and update targets an inheritable leaf, reject that leaf.

- `toEffectiveSetting`: `readOnly: effective.source === "env" || effective.source === "inherited"`; pass through `inheritWhen` / `inheritFrom` from definition; for secrets with `inherited`, `value` stays `null`, `isSet` true if source value non-empty.

- [ ] **Step 1: Failing tests**

```ts
it("inherits integration clientId from oauth when inheritCredentials is true", async () => {
  const service = createAppConfigService({ encryptionKey });
  await service.load();
  await service.set("oauth.providers.strava.clientId", "login-id", ACTOR);
  // inheritCredentials defaults true
  expect(service.get<string>("integration.strava.clientId")).toBe("login-id");
  expect(service.getEffectiveMeta("integration.strava.clientId").source).toBe("inherited");
  expect(service.getEffectiveMeta("integration.strava.clientId").readOnly).toBe(true);
});

it("rejects writing integration clientId while inheriting", async () => {
  const service = createAppConfigService({ encryptionKey });
  await service.load();
  await expect(service.set("integration.strava.clientId", "own-id", ACTOR)).rejects.toThrow(
    /inherit/i,
  );
});

it("uses own clientId after inheritCredentials is false", async () => {
  const service = createAppConfigService({ encryptionKey });
  await service.load();
  await service.set("oauth.providers.strava.clientId", "login-id", ACTOR);
  await service.setMany(
    [
      { key: "integration.strava.inheritCredentials", value: false },
      { key: "integration.strava.clientId", value: "own-id" },
    ],
    ACTOR,
  );
  expect(service.get<string>("integration.strava.clientId")).toBe("own-id");
  expect(service.getEffectiveMeta("integration.strava.clientId").source).toBe("database");
});
```

- [ ] **Step 2: Implement resolve + guards + EffectiveSetting fields.**

- [ ] **Step 3: Run admin-config tests — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/services/app-config.ts server/src/test/admin-config.test.ts
git commit -m "feat(server): resolve inherited settings and block writes while inheriting"
```

---

### Task 4: GraphQL admin fields for inherit / readOnly / inherited

**Files:**

- Modify: `server/src/graphql/schema/admin.ts`
- Modify: `server/src/test/admin-graphql.test.ts`
- Modify: `client/src/lib/graphql/operations.ts`

**Interfaces:**

- `AdminSettingSource` values: `env`, `database`, `default`, `inherited`
- Expose `readOnly`, `inheritWhen`, `inheritFrom` on `AdminSetting`

- [ ] **Step 1: Extend GraphQL object + enum; update client operation strings and `AdminSettingGql` / `AdminSettingSourceGql` types.**

- [ ] **Step 2: Assert in admin-graphql test that settings payload includes `readOnly` and source enum accepts inherited (seed inherit case or just query shape).**

- [ ] **Step 3: `npm run -w shared build && npm run -w server test -- src/test/admin-graphql.test.ts` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/graphql/schema/admin.ts server/src/test/admin-graphql.test.ts client/src/lib/graphql/operations.ts
git commit -m "feat(server, client): expose inherited source and inherit metadata in admin GraphQL"
```

---

### Task 5: Logging boot wire-up (`toFile` / `filePath` / `redact`)

**Files:**

- Modify: `server/src/lib/runtime-config.ts` — add `syncLoggingEnvFromConfig`
- Modify: `server/src/lib/logging/index.ts` — lazy init
- Modify: `server/src/index.ts` — load config → sync logging env → `initLogging()` before other work that logs heavily
- Modify: `logging/src/config.ts` if needed for empty `LOG_FILE_PATH`
- Test: `server/src/test/runtime-config.test.ts`

**Interfaces:**

```ts
export function syncLoggingEnvFromConfig(
  config: AppConfigService,
  env: NodeJS.ProcessEnv = process.env,
): void {
  // Always write effective config into LOG_* before initLogging().
  // LOG_* are not registry envOverrides; operators should clear them from .env after migrating.
  env.LOG_LEVEL = config.get<string>("logging.level");
  env.LOG_TO_FILE = config.get<boolean>("logging.toFile") ? "true" : "false";
  const filePath = config.get<string>("logging.filePath");
  if (filePath.trim()) env.LOG_FILE_PATH = filePath;
  else delete env.LOG_FILE_PATH;
  env.LOG_REDACT = config.get<boolean>("logging.redact") ? "true" : "false";
}
```

Lazy logging module pattern:

```ts
import { createLogging, type Logging } from "logging";

let logging: Logging | null = null;

function requireLogging(): Logging {
  if (!logging) {
    throw new Error("Server logging must be initialized after app config load");
  }
  return logging;
}

export function initLogging(): void {
  if (logging) return;
  logging = createLogging({
    service: "mybike-server",
    defaultLogFilePath: resolve(repoRoot, "server/data/mybike.log"),
    healthCheckPaths: ["/api/health"],
  });
}

export const logger = new Proxy({} as Logger, {
  get(_t, prop, receiver) {
    return Reflect.get(requireLogging().logger, prop, receiver);
  },
}) as Logger;

// similarly proxy or getters for httpLogger, child, getLog, withLogContext, flushLogs, setLoggerLevel
```

Boot order in `main()` (lazy logging is required so DB-backed `toFile` / `filePath` / `redact` apply after restart):

```ts
await initDatabase();
// migrations — use console.error if logging is not ready yet
await appConfig.load();
await appConfig.markBootComplete();
syncLoggingEnvFromConfig(appConfig);
initLogging();
runtimeCleanup.push(applyProcessLoggerLevel(appConfig));
```

Search for module-scope `logger.` calls that run at import time before `initLogging()` and move them into functions called after boot.

- [ ] **Step 1: Failing test** — service sets `logging.toFile` false, `syncLoggingEnvFromConfig`, expect `env.LOG_TO_FILE === "false"`.

- [ ] **Step 2: Implement sync + lazy init + boot reorder; fix import-time log uses.**

- [ ] **Step 3: Drop `GRAPHQL_TIMING` fallback in `request-timing.ts` (config only).**

- [ ] **Step 4: Run runtime-config + request-timing + admin-config tests — PASS.**

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/runtime-config.ts server/src/lib/logging/index.ts server/src/index.ts server/src/graphql/request-timing.ts logging/src/config.ts server/src/test/*.ts
git commit -m "feat(server): apply logging settings from config at boot"
```

---

### Task 6: Webhook `proxyUrl` + `subscriptionId` hot path

**Files:**

- Modify: `server/src/lib/strava-event-source.ts`
- Modify: `server/src/lib/strava-webhook-processor.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/test/strava-webhook.test.ts` (and/or admin/runtime tests)

**Interfaces:**

```ts
export function getStravaWebhookProxyUrl(): string | undefined {
  const configured = getLoadedAppConfigValue<string>("strava.webhook.proxyUrl");
  const trimmed = configured?.trim();
  return trimmed ? trimmed : undefined;
}

export function getStravaWebhookProxyApiKey(): string | undefined {
  const configured = getLoadedAppConfigValue<string>("strava.webhook.proxyApiKey");
  const trimmed = configured?.trim();
  return trimmed ? trimmed : undefined;
}
```

Remove `process.env.STRAVA_WEBHOOK_PROXY_*` fallbacks for these.

```ts
export function getStravaWebhookSubscriptionId(): number | undefined {
  const raw = getLoadedAppConfigValue<string>("strava.webhook.subscriptionId")?.trim();
  // parse int; undefined if empty
}
```

`createStravaEventSource` uses url + api key helpers. `index.ts` missing-config log lists setting keys not env vars. Subscribe `onChange` for `proxyUrl` and `subscriptionId` to restart polling (same as api key).

- [ ] **Step 1: Update tests that set env to instead insert settings / use appConfig.set.**

- [ ] **Step 2: Implement helpers + wire subscribers.**

- [ ] **Step 3: Run strava-webhook tests — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/strava-event-source.ts server/src/lib/strava-webhook-processor.ts server/src/index.ts server/src/test/strava-webhook.test.ts
git commit -m "feat(server): drive webhook proxy URL and subscription id from app config"
```

---

### Task 7: OAuth providers from `oauth.providers.*`

**Files:**

- Modify: `server/src/lib/tsidp-oauth.ts`
- Modify: `server/src/lib/strava-oauth.ts`
- Modify: `server/src/lib/oauth-providers.ts`
- Modify: `server/src/test/oauth-providers.test.ts`
- Modify: related strava-oauth tests

**Interfaces:**

Prefer reading via `getLoadedAppConfigValue` / small helper `getOAuthProviderConfig("tsidp" | "strava")` after config load. Auth is constructed inside `createApp()` after boot sync — ensure `appConfig.load()` completed (already true in `index.ts` before `createApp()`).

```ts
export function isTsidpOAuthConfigured(): boolean {
  if (!getLoadedAppConfigValue<boolean>("oauth.providers.tsidp.enabled")) return false;
  return Boolean(
    getLoadedAppConfigValue<string>("oauth.providers.tsidp.clientId")?.trim() &&
    getLoadedAppConfigValue<string>("oauth.providers.tsidp.clientSecret")?.trim() &&
    getLoadedAppConfigValue<string>("oauth.providers.tsidp.issuer")?.trim(),
  );
}
```

Same pattern for Strava login (`oauth.providers.strava.*`). Remove module-level `process.env.STRAVA_SCOPES` constant; read scopes from config inside `buildStravaOAuthConfig`.

Tests: set settings via `appConfig` instead of env; `enabled: false` → provider absent even with creds.

- [ ] **Step 1: Failing tests for enabled gate + config-sourced credentials.**

- [ ] **Step 2: Implement builders; keep injectable env bag only if tests need it — prefer config service mock/load.**

- [ ] **Step 3: Run oauth-providers + strava-oauth tests — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/tsidp-oauth.ts server/src/lib/strava-oauth.ts server/src/lib/oauth-providers.ts server/src/test/oauth-providers.test.ts server/src/test/strava-oauth.test.ts
git commit -m "feat(server): build Better Auth OAuth providers from app config"
```

---

### Task 8: Integration Strava (`/api/strava`) from resolved credentials

**Files:**

- Modify: `server/src/lib/strava-client.ts`
- Modify: `server/src/routes/strava.ts` (and any `requireStravaCredentials` call sites)
- Test: `server/src/test/strava-token.test.ts`, webhook/sync tests that need client id/secret

**Interfaces:**

```ts
export function isStravaIntegrationEnabled(): boolean {
  return getLoadedAppConfigValue<boolean>("integration.strava.enabled") === true;
}

export function getStravaIntegrationCredentials(): { clientId: string; clientSecret: string } {
  // uses appConfig.get so inherit applies
  const clientId = appConfig.get<string>("integration.strava.clientId").trim();
  const clientSecret = appConfig.get<string>("integration.strava.clientSecret").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Strava integration credentials are not configured");
  }
  return { clientId, clientSecret };
}
```

`buildStravaAuthorizationUrl` uses `integration.strava.redirectUri` + `integration.strava.scopes`. Token exchange uses integration credentials. Routes return 503/disabled when `!isStravaIntegrationEnabled()`.

Note: login OAuth and integration no longer share env; tests must configure both (or inherit) explicitly.

- [ ] **Step 1: Update failing credential tests for config + enabled flag.**

- [ ] **Step 2: Implement helpers; replace `process.env.STRAVA_CLIENT_*` / `REDIRECT_URI` / sync scopes reads.**

- [ ] **Step 3: Run affected server tests — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/strava-client.ts server/src/routes/strava.ts server/src/test/*.ts
git commit -m "feat(server): drive Strava sync integration from app config with inherit"
```

---

### Task 9: Admin Configuration UI — inherited + readOnly

**Files:**

- Modify: `client/src/features/admin/ConfigurationPage.tsx`
- Modify: `client/src/features/admin/config-draft.ts` / tests if submit skips readOnly
- Test: `client/src/features/admin/config-draft.test.ts` (extend)

**Interfaces:**

- Treat `setting.readOnly` (or `source === "env" | "inherited"`) as disabled for edits and exclude from save inputs.
- Badge for `inherited` (e.g. violet/purple text `inherited`).
- Collapsible help: when inherited, explain “Inherited from `{inheritFrom}`; turn off `{inheritWhen}` to edit.”
- Group titles come from registry `group` strings already (`OAuth · tsidp`, etc.) — no hard-coded group list required.

- [ ] **Step 1: Unit test draft helper skips readOnly keys on submit.**

- [ ] **Step 2: Update ConfigurationPage badges + disabled + copy.**

- [ ] **Step 3: `npm run -w client test` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add client/src/features/admin/ConfigurationPage.tsx client/src/features/admin/config-draft.ts client/src/features/admin/config-draft.test.ts client/src/lib/graphql/operations.ts
git commit -m "feat(client): show inherited settings and block edits while inheriting"
```

---

### Task 10: Migration docs + `.env.example`

**Files:**

- Create: `docs/admin-runtime-config-migration.md`
- Modify: `.env.example`
- Modify: `AGENTS.md` (short pointer under Admin runtime config bullet)

**Content requirements for `docs/admin-runtime-config-migration.md`:**

1. Bootstrap vs runtime vs proxy tables
2. Full legacy env → registry key map (from spec inventory)
3. Deploy migrate steps (encryption key, paste in UI, enable flags, restart, remove migrated `.env` keys)
4. Strava login vs sync + inherit
5. Developer checklist for adding a setting

`.env.example`: comment blocks for LOG__, GRAPHQL_TIMING, TSIDP__, STRAVA_* (MyBike-side) pointing to Admin → Configuration; leave bootstrap + proxy vars as real env.

- [ ] **Step 1: Write the doc and update `.env.example` / AGENTS pointer.**

- [ ] **Step 2: Commit**

```bash
git add docs/admin-runtime-config-migration.md .env.example AGENTS.md
git commit -m "docs: explain admin runtime config migration from env"
```

---

### Task 11: Verify

- [ ] **Step 1: `npm run -w shared build && npm run verify` — PASS.**

- [ ] **Step 2: Fix any failures; do not skip hooks.**

- [ ] **Step 3: Final commit only if verify forced fixes** (format/lint).

---

## Spec coverage checklist

| Spec requirement                       | Task                  |
| -------------------------------------- | --------------------- |
| Expand keys + `inherited` source       | 1–3                   |
| Inherit resolve + write reject         | 3                     |
| GraphQL metadata                       | 4                     |
| Logging complete + `toFile` wire       | 5                     |
| Webhook url + subscriptionId           | 6                     |
| OAuth providers map + enabled          | 7                     |
| Integration Strava + inherit consumers | 8                     |
| Admin UI inherit UX                    | 9                     |
| Migration docs                         | 10                    |
| No proxy / no auto-importer            | Constraints + Task 10 |
| `enabled` default false                | Task 2 defaults       |

## Self-review notes

- Logging boot **must** init after config sync (Task 5); eager logger cannot honor DB `toFile` on restart.
- Batch update allowing inherit off + credential write in one save is required for admin UX.
- Empty-string URL schemas avoid breaking defaults for optional URL fields.
