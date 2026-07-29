# Env Seed-if-Absent Implementation Plan

> **Status: COMPLETE (implemented on this branch).** Do not re-execute unchecked task boxes.
> Design-of-record: `docs/superpowers/specs/2026-07-29-env-seed-if-absent-design.md`. Operator guide: `docs/admin-runtime-config-migration.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace live env override with seed-if-absent into `app_settings`, add `server.port`, warn when leftover env remains after a row exists, and remove `env` / `envVar` from the admin API and UI.

**Architecture:** Registry uses `seedFromEnv` instead of `envOverride`. On `appConfig.load()`, missing rows are seeded from env (validated, secrets encrypted, audited as system). Effective precedence is inherit → DB → default. Leftover env with an existing row logs a non-fatal warn. `syncAuthEnvFromConfig` always writes effective URLs into `process.env`. Listen uses `server.port` after config load.

**Spec:** `docs/superpowers/specs/2026-07-29-env-seed-if-absent-design.md`

**Tech Stack:** Existing app-config + settings registry, shared enums, Pothos GraphQL, React admin Configuration page, Vite+ tests.

## Global Constraints

- Precedence: inherit (when applicable) > DB > default — **no live env override**
- Bootstrap stays `.env` only: `DB_PATH`, `TURSO_*`, `CONFIG_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `NODE_ENV`, `RUN_MIGRATIONS`, `DRIZZLE_MIGRATIONS_FOLDER`, `SQLITE_IMPORT_PATH`
- Proxy-process env out of scope
- Invalid seed values: warn + skip; do not crash boot
- Warning copy (exact intent): `{VAR} is set in the environment but {key} already exists in app_settings; the env value is ignored. Remove {VAR} from .env to avoid accidental re-seed if the database row is deleted.`
- No `envVar` / `source: "env"` in GraphQL or UI
- `enabled` / `inheritCredentials` keys have **no** `seedFromEnv`
- After `shared` changes: `npm run -w shared build` before server/client tests
- Prefer `npm run verify` before considering the branch done

## File map

| File                                                     | Responsibility                                              |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `shared/src/schemas/app-settings.ts`                     | Add `server.port`; drop `"env"` from sources                |
| `shared/src/schemas.test.ts`                             | Update key/source expectations                              |
| `server/src/lib/settings-registry.ts`                    | `seedFromEnv` metadata; `server.port`; remove `envOverride` |
| `server/src/services/app-config.ts`                      | Seed-if-absent + leftover warn; remove env resolve path     |
| `server/src/lib/runtime-config.ts`                       | Always sync auth URLs from effective config                 |
| `server/src/index.ts`                                    | Listen on `server.port`                                     |
| `server/src/graphql/schema/admin.ts`                     | Drop `envVar`; sources without `env`                        |
| `server/src/test/admin-config.test.ts`                   | Seed / warn / no-override tests                             |
| `server/src/test/admin-graphql.test.ts`                  | No `envVar`; no `env` source                                |
| `server/src/test/runtime-config.test.ts`                 | Auth sync overwrites leftover env                           |
| `client/src/lib/graphql/operations.ts`                   | Types + queries                                             |
| `client/src/features/admin/ConfigurationPage.tsx`        | Remove env badge/copy; precedence caption                   |
| `client/src/features/admin/config-draft.ts` / `.test.ts` | Drop `env` from readOnly helpers if present                 |
| `docs/admin-runtime-config-migration.md`                 | New precedence + seed docs                                  |
| `.env.example` / `AGENTS.md`                             | First-boot seed wording                                     |

---

### Task 1: Shared keys + drop `env` source

**Files:**

- Modify: `shared/src/schemas/app-settings.ts`
- Modify: `shared/src/schemas.test.ts`

**Interfaces:**

```ts
export const APP_SETTING_KEYS = [
  "server.port",
  // ...existing keys in current order after server.port
] as const;

export const SETTING_VALUE_SOURCES = ["database", "default", "inherited"] as const;
```

Place `server.port` first in the array; Task 2 registry order must match.

- [ ] **Step 1: Failing test** — expect `APP_SETTING_KEYS` to include `"server.port"` and `SETTING_VALUE_SOURCES` equal to `["database", "default", "inherited"]` (no `"env"`).

- [ ] **Step 2: Update `app-settings.ts`.**

- [ ] **Step 3: `npm run -w shared test && npm run -w shared build` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add shared/src/schemas/app-settings.ts shared/src/schemas.test.ts
git commit -m "feat(shared): add server.port and drop env setting source"
```

---

### Task 2: Registry `seedFromEnv` + `server.port`

**Files:**

- Modify: `server/src/lib/settings-registry.ts`
- Modify: `server/src/test/admin-config.test.ts` (registry shape; remove envOverride assertions)

**Interfaces:**

```ts
export type SettingDefinition<T = unknown> = {
  key: AppSettingKey;
  schema: ZodType<T>;
  defaultValue: T;
  effect: SettingEffect;
  secret?: boolean;
  seedFromEnv?: {
    varName: string;
    parse?: (raw: string) => unknown;
  };
  inheritWhen?: AppSettingKey;
  inheritFrom?: AppSettingKey;
  group: string;
  label: string;
  description: string;
};

function parseEnvBoolDefaultTrue(raw: string): boolean {
  return raw.trim().toLowerCase() !== "false";
}

function parseEnvBoolLoose(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function parseEnvInt(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer: ${raw}`);
  return n;
}
```

Add as first definition:

```ts
{
  key: "server.port",
  schema: z.number().int().positive(),
  defaultValue: 3001,
  effect: "restartRequired",
  seedFromEnv: { varName: "PORT", parse: parseEnvInt },
  group: "Server",
  label: "HTTP port",
  description: "TCP port the API listens on.",
}
```

Replace `envOverride` with `seedFromEnv` on URL keys. Apply the full seed map from the spec. Omit `seedFromEnv` on `*.enabled` and `integration.strava.inheritCredentials`.

**Note:** Changing the registry while `app-config` still resolves `envOverride` will break tests. Prefer landing Task 2 and Task 3 in **one commit** if the suite cannot stay green between them.

- [ ] **Step 1: Update registry type + all definitions; match `APP_SETTING_KEYS` order.**

- [ ] **Step 2: Fix registry assertions in admin-config tests.**

- [ ] **Step 3: Proceed to Task 3 in the same change set if needed for green tests.**

- [ ] **Step 4: Commit** (alone only if green; otherwise with Task 3)

```bash
git add server/src/lib/settings-registry.ts server/src/test/admin-config.test.ts
git commit -m "feat(server): declare seedFromEnv metadata and server.port"
```

---

### Task 3: Config service seed-if-absent + leftover warn

**Files:**

- Modify: `server/src/services/app-config.ts`
- Modify: `server/src/test/admin-config.test.ts`

**Interfaces:**

- Remove `hasEnvOverride` / env branch from `resolveSetting`
- `EffectiveSetting`: remove `envVar`
- `readOnly`: only `source === "inherited"`
- During `load()`, after `loadDbRows` and before computing the effective map:

```ts
async function seedMissingFromEnv(rows: Map<AppSettingKey, StoredSettingRow>): Promise<void> {
  for (const definition of SETTINGS_DEFINITIONS) {
    const seed = definition.seedFromEnv;
    if (!seed) continue;
    const raw = env[seed.varName];
    if (raw === undefined || raw.trim() === "") continue;

    if (rows.has(definition.key)) {
      console.warn(
        `${seed.varName} is set in the environment but ${definition.key} already exists in app_settings; the env value is ignored. Remove ${seed.varName} from .env to avoid accidental re-seed if the database row is deleted.`,
      );
      continue;
    }

    try {
      const parsedRaw = seed.parse ? seed.parse(raw) : raw;
      const parsed = definition.schema.parse(parsedRaw);
      // upsert app_settings (encrypt if secret) + writeAdminAudit actor null
      // rows.set(definition.key, storedRow) so resolve sees it
    } catch (err) {
      console.warn(
        `Skipping seed of ${definition.key} from ${seed.varName}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
```

Use `console.warn` during load (logging may not be initialized yet).

- [ ] **Step 1: Failing tests** (adapt names to existing helpers)

```ts
it("seeds client.url from CLIENT_URL when no row exists", async () => {
  const service = createAppConfigService({
    env: { ...TEST_ENV, CLIENT_URL: "https://app.example.test" },
    encryptionKey,
  });
  await service.load();
  expect(service.get<string>("client.url")).toBe("https://app.example.test");
  expect(service.getEffectiveMeta("client.url").source).toBe("database");
});

it("ignores CLIENT_URL when row exists and warns", async () => {
  const warns: string[] = [];
  const original = console.warn;
  console.warn = (msg?: unknown) => {
    warns.push(String(msg));
  };
  try {
    await insertSetting("client.url", JSON.stringify("https://db.example.test"));
    const service = createAppConfigService({
      env: { ...TEST_ENV, CLIENT_URL: "https://env.example.test" },
      encryptionKey,
    });
    await service.load();
    expect(service.get<string>("client.url")).toBe("https://db.example.test");
    expect(warns.some((w) => w.includes("CLIENT_URL") && w.includes("client.url"))).toBe(true);
  } finally {
    console.warn = original;
  }
});

it("does not use env as live override for betterAuth.baseUrl", async () => {
  await insertSetting("betterAuth.baseUrl", JSON.stringify("https://db.example.test"));
  const service = createAppConfigService({
    env: { ...TEST_ENV, BETTER_AUTH_URL: "https://env.example.test" },
    encryptionKey,
  });
  await service.load();
  expect(service.getEffectiveMeta("betterAuth.baseUrl").source).toBe("database");
  expect(service.get<string>("betterAuth.baseUrl")).toBe("https://db.example.test");
});
```

Remove obsolete tests that expect `source: "env"`.

- [ ] **Step 2: Implement seed + remove env override path.**

- [ ] **Step 3: `npm run -w shared build && npm run -w server test -- src/test/admin-config.test.ts` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/services/app-config.ts server/src/lib/settings-registry.ts server/src/test/admin-config.test.ts
git commit -m "feat(server): seed app settings from env when rows are missing"
```

---

### Task 4: Auth sync overwrite + listen on `server.port`

**Files:**

- Modify: `server/src/lib/runtime-config.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/test/runtime-config.test.ts`
- Modify: `server/src/routes/strava.ts` if it still reads `process.env.CLIENT_URL` — use config / effective synced env after boot

**Interfaces:**

```ts
export function syncAuthEnvFromConfig(
  config: AppConfigService,
  env: NodeJS.ProcessEnv = process.env,
): void {
  env.BETTER_AUTH_URL = config.get<string>("betterAuth.baseUrl");
  env.CLIENT_URL = config.get<string>("client.url");
}
```

```ts
const port = appConfig.get<number>("server.port");
server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
```

- [ ] **Step 1: Test** — leftover `CLIENT_URL` on the env object is overwritten by `syncAuthEnvFromConfig`.

- [ ] **Step 2: Implement sync + listen + fix direct CLIENT_URL reads.**

- [ ] **Step 3: Run runtime-config + affected tests — PASS.**

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/runtime-config.ts server/src/index.ts server/src/routes/strava.ts server/src/test/runtime-config.test.ts
git commit -m "feat(server): apply auth URLs and listen port from app config"
```

---

### Task 5: GraphQL + client operations — drop `env` / `envVar`

**Files:**

- Modify: `server/src/graphql/schema/admin.ts`
- Modify: `server/src/test/admin-graphql.test.ts`
- Modify: `client/src/lib/graphql/operations.ts`

**Interfaces:**

- Remove `envVar` from `AdminSetting`
- `AdminSettingSource` / client type: `database` | `default` | `inherited` only
- Remove `envVar` from query and mutation selections

- [ ] **Step 1: Update schema, client ops, graphql tests.**

- [ ] **Step 2: `npm run -w shared build && npm run -w server test -- src/test/admin-graphql.test.ts` — PASS.**

- [ ] **Step 3: Commit**

```bash
git add server/src/graphql/schema/admin.ts server/src/test/admin-graphql.test.ts client/src/lib/graphql/operations.ts
git commit -m "feat(server, client): remove env override fields from admin settings API"
```

---

### Task 6: Admin Configuration UI

**Files:**

- Modify: `client/src/features/admin/ConfigurationPage.tsx`
- Modify: `client/src/features/admin/config-draft.ts`
- Modify: `client/src/features/admin/config-draft.test.ts`

**Interfaces:**

- `isConfigSettingReadOnly`: `setting.readOnly || setting.source === "inherited"` only
- Remove env badge and env help copy
- Precedence caption: database > default (+ inherited note already present)

- [ ] **Step 1: Update draft helper tests that use `source: "env"`.**

- [ ] **Step 2: Update UI.**

- [ ] **Step 3: `npm run -w client test` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add client/src/features/admin/ConfigurationPage.tsx client/src/features/admin/config-draft.ts client/src/features/admin/config-draft.test.ts
git commit -m "feat(client): drop env-override UI from admin configuration"
```

---

### Task 7: Docs + `.env.example`

**Files:**

- Modify: `docs/admin-runtime-config-migration.md`
- Modify: `.env.example`
- Modify: `AGENTS.md` if wording still says env wins

**Content:**

- Precedence: DB > default (+ inherit); env seeds missing rows only
- Leftover-env warning
- Reset = delete row
- Seedable map aligned with spec
- Developer checklist: `seedFromEnv`, not `envOverride`
- `.env.example`: `PORT`, auth URLs, LOG_*, Strava/tsidp as **first-boot seeds**

- [ ] **Step 1: Update docs.**

- [ ] **Step 2: Commit**

```bash
git add docs/admin-runtime-config-migration.md .env.example AGENTS.md
git commit -m "docs: describe env seed-if-absent for runtime settings"
```

---

### Task 8: Verify

- [ ] **Step 1: `npm run -w shared build && npm run verify` — PASS.**

- [ ] **Step 2: Fix failures; commit only if verify forces format/lint fixes.**

---

## Spec coverage checklist

| Spec item                                     | Task       |
| --------------------------------------------- | ---------- |
| Drop live env override / `env` source         | 1, 3, 5, 6 |
| `seedFromEnv` + full seed map                 | 2          |
| Seed-if-absent + leftover warn + invalid skip | 3          |
| `server.port` + listen                        | 1, 2, 4    |
| Always sync auth env from config              | 4          |
| Remove `envVar` API/UI                        | 5, 6       |
| Docs                                          | 7          |

## Self-review notes

- Tasks 2–3 may share one commit if the suite cannot pass mid-way.
- Seed warnings use `console.warn` during `load()` because logging may not be initialized.
- Test setup that sets `BETTER_AUTH_URL` / `CLIENT_URL` will seed those rows on first `load()` — rewrite tests that expected `source: "env"`.
