# Admin RBAC & Runtime Config — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation for DB-backed runtime settings, RBAC (seeded admin/user + bootstrap admin), GraphQL admin APIs, secret encryption, hot-reload vs controlled process restart, and a small admin UI — migrating only a sample set of settings that prove every path.

**Architecture:** Bootstrap stays in `.env`. Runtime overrides live in `app_settings` (dotted keys). A code registry declares schema/defaults/`hotReload|restartRequired`/optional `envOverride`. Config service merges env (opt-in) > DB > default, encrypts secrets with AES-GCM (`CONFIG_ENCRYPTION_KEY`), notifies subscribers or sets `pendingRestart`. Better Auth–related settings are **restart-required only** (save → `restartServer` → `process.exit(0)` → Docker restarts). RBAC gates admin GraphQL; seed `admin@example.com` / `admin123`.

**Spec:** `docs/superpowers/specs/2026-07-27-admin-runtime-config-design.md`

**Tech Stack:** Drizzle + Turso, Zod (`shared`), Pothos/Yoga GraphQL, Better Auth, Node `crypto` (AES-256-GCM), React + TanStack Query + existing GraphQL client, Vite+ tests.

## Global Constraints

- Precedence: opt-in env override (if set) > DB override > code default.
- Bootstrap-only (never in DB): `PORT`, `NODE_ENV`, DB/Turso, `RUN_MIGRATIONS`, `DRIZZLE_MIGRATIONS_FOLDER`, `BETTER_AUTH_SECRET`, `CONFIG_ENCRYPTION_KEY`.
- Phase 1 migrated keys only (normative):
  - `logging.level` — hot
  - `graphql.timing` — hot
  - `strava.webhook.pollIntervalMs` — hot
  - `strava.webhook.proxyApiKey` — hot + secret
  - `logging.toFile` — restart-required
  - `betterAuth.baseUrl` — restart-required + env override `BETTER_AUTH_URL`
  - `client.url` — restart-required + env override `CLIENT_URL`
- Keyed maps for collections later; no `oauth.0.*` in Phase 1.
- GraphQL admin only (no REST `/api/admin`).
- Session users: enforce app RBAC permissions. API keys: do **not** grant admin RBAC in Phase 1 (fail closed for admin fields unless explicitly decided otherwise — default deny).
- After `shared` changes: `npm run -w shared build` before server/client tests.
- Prefer `npm run verify` before considering the branch done.
- Docker: add `restart: unless-stopped` to `compose.yaml` so `restartServer` works.

---

## File map

| File                                                        | Responsibility                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `shared/src/schemas/admin-permissions.ts`                   | Permission/role id constants                                                                                             |
| `shared/src/schemas/app-settings-registry.ts`               | Setting key registry metadata + Zod (or server-only if preferred; prefer `shared` for keys used by client labels)        |
| `shared/src/index.ts`                                       | Re-exports                                                                                                               |
| `server/src/db/schema.ts`                                   | `roles`, `permissions`, `role_permissions`, `user_roles`, `app_settings`, `config_audit_log`, restart state if persisted |
| `server/drizzle/<ts>_admin_rbac_config/`                    | SQL migration                                                                                                            |
| `server/src/lib/config-crypto.ts`                           | AES-GCM encrypt/decrypt                                                                                                  |
| `server/src/lib/rbac.ts`                                    | Load user permissions; `requireAppPermission`                                                                            |
| `server/src/lib/bootstrap-admin.ts`                         | Idempotent seed admin user + role                                                                                        |
| `server/src/services/app-config.ts`                         | Config service: load/merge/get/set/onChange/pendingRestart                                                               |
| `server/src/services/admin-users.ts`                        | List users, assign role                                                                                                  |
| `server/src/graphql/schema/admin.ts`                        | Admin GraphQL types/resolvers                                                                                            |
| `server/src/graphql/schema/index.ts`                        | Import admin module                                                                                                      |
| `server/src/graphql/context.ts`                             | Attach role permissions for session users                                                                                |
| `server/src/index.ts`                                       | Boot: load config, seed admin, wire poll interval subscriber; expose restart                                             |
| `server/src/lib/logging/index.ts` (+ logging pkg if needed) | Allow runtime level change                                                                                               |
| `server/src/graphql/request-timing.ts`                      | Read timing flag from config service                                                                                     |
| `server/src/lib/auth-config.ts` / `auth.ts`                 | Read base/client URLs from config at **construction** (restart applies)                                                  |
| `compose.yaml`                                              | `restart: unless-stopped`; document `CONFIG_ENCRYPTION_KEY`                                                              |
| `.env.example`                                              | `CONFIG_ENCRYPTION_KEY`                                                                                                  |
| `client/src/routes/admin-*.tsx` + nav                       | Configuration, Users, Audit UI                                                                                           |
| `client/src/lib/graphql/operations.ts`                      | Admin operations                                                                                                         |
| `server/src/test/admin-config.test.ts`                      | Foundation tests                                                                                                         |
| `server/src/test/admin-rbac.test.ts`                        | Permission / role assignment tests                                                                                       |

---

### Task 1: Shared permission constants + settings key registry stubs

**Files:**

- Create: `shared/src/schemas/admin-permissions.ts`
- Create: `shared/src/schemas/app-settings.ts` (keys, sources, effect enums — full registry metadata may live on server if Zod defaults are server-only; keep **key strings** and client-safe enums in shared)
- Modify: `shared/src/index.ts`
- Test: `shared/src/schemas.test.ts` (or new `shared/src/admin-permissions.test.ts`)

**Interfaces:**

- Produces: `APP_PERMISSIONS` = `["config.read","config.write","server.restart","users.read","users.assign_role","audit.read"] as const`
- Produces: `AppPermission`, `APP_ROLES` = `["admin","user"] as const`
- Produces: `APP_SETTING_KEYS` and `SettingValueSource` = `"env" | "database" | "default"`

- [ ] **Step 1: Write failing test** that imports `APP_PERMISSIONS` and expects the six permission strings.

- [ ] **Step 2: Implement modules + export from `shared/src/index.ts`.**

- [ ] **Step 3: `npm run -w shared test` and `npm run -w shared build` — PASS.**

- [ ] **Step 4: Commit**

```bash
git add shared/src/schemas/admin-permissions.ts shared/src/schemas/app-settings.ts shared/src/index.ts shared/src/**/*.test.ts
git commit -m "feat(shared): add admin permission and setting key constants"
```

---

### Task 2: DB schema + migration for RBAC, settings, audit

**Files:**

- Modify: `server/src/db/schema.ts`
- Create: `server/drizzle/<timestamp>_admin_rbac_config/migration.sql` (generate via `npm run -w server db:generate` after schema edit, or hand-write consistently with existing folders)
- Modify: export tables from schema index if needed

**Interfaces:**

- Tables:
  - `roles(id text PK, name text unique, …)`
  - `permissions(id text PK, name text unique)`
  - `role_permissions(role_id, permission_id)` PK composite
  - `user_roles(user_id → user.id, role_id)` unique(user_id) for v1 single-role
  - `app_settings(key text PK, value text not null, is_secret integer not null, updated_at, updated_by)`
  - `config_audit_log(id, actor_user_id, key, old_value, new_value, created_at)`
  - Optional: `app_runtime_state(key PK, value)` for `pending_restart` = `"1"`

- Seed SQL (idempotent inserts): roles `admin`/`user`; all permissions; map all permissions to `admin`.

- [ ] **Step 1: Add Drizzle table definitions matching the columns above.**

- [ ] **Step 2: Generate/apply migration; verify `npm run -w server db:migrate` succeeds on a fresh DB.**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(server): add RBAC and app_settings schema migration"
```

---

### Task 3: Config crypto helper (AES-256-GCM)

**Files:**

- Create: `server/src/lib/config-crypto.ts`
- Create: `server/src/test/config-crypto.test.ts`
- Modify: `.env.example` — document `CONFIG_ENCRYPTION_KEY`

**Interfaces:**

```typescript
export function requireConfigEncryptionKey(env?: NodeJS.ProcessEnv): Buffer;
export function encryptSecret(plaintext: string, key: Buffer): string; // JSON envelope {v:1,iv,tag,ct} base64 fields
export function decryptSecret(envelope: string, key: Buffer): string;
```

- Key: `CONFIG_ENCRYPTION_KEY` as base64 32-byte key (or derive via `scrypt` from passphrase — prefer raw 32-byte base64 for v1; document `openssl rand -base64 32`).
- In test env, allow a fixed test key in `server/src/test/setup.ts`.

- [ ] **Step 1: Write round-trip + tamper-fail tests.**

- [ ] **Step 2: Implement with `node:crypto` `createCipheriv`/`createDecipheriv` AES-256-GCM.**

- [ ] **Step 3: Run `npm run -w server test -- src/test/config-crypto.test.ts` — PASS.**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): add AES-GCM helper for secret app settings"
```

---

### Task 4: Bootstrap admin seed + RBAC helpers

**Files:**

- Create: `server/src/lib/bootstrap-admin.ts`
- Create: `server/src/lib/rbac.ts`
- Modify: `server/src/index.ts` or migrate runner to call `ensureBootstrapAdmin()` after migrations
- Modify: `server/src/test/setup.ts` if needed
- Test: `server/src/test/admin-rbac.test.ts` (partial)

**Interfaces:**

```typescript
export async function ensureBootstrapAdmin(): Promise<void>;
// Creates user admin@example.com / admin123 if missing, assigns admin role.
// Hash via: const ctx = await auth.$context; await ctx.password.hash("admin123");
// Account: providerId "credential", issuer "local:credential", providerAccountId = user.id

export async function getUserPermissionSet(userId: string): Promise<Set<string>>;
export function userHasPermission(perms: Set<string>, permission: string): boolean;
```

Default role for users without `user_roles` row: treat as `user` (no admin perms). Optionally assign `user` on register later (Phase 1: missing row = no admin).

- [ ] **Step 1: Test that after `ensureBootstrapAdmin()`, signing in as admin@example.com / admin123 works via Better Auth.**

- [ ] **Step 2: Implement seed + rbac loaders.**

- [ ] **Step 3: Call seed from `server/scripts/migrate.ts` after `applyMigrations()` and/or server boot (idempotent).**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): seed bootstrap admin and RBAC helpers"
```

---

### Task 5: Settings registry + config service

**Files:**

- Create: `server/src/lib/settings-registry.ts` — Phase 1 keys with Zod, defaults, effect, secret, envOverride
- Create: `server/src/services/app-config.ts`
- Test: `server/src/test/admin-config.test.ts`

**Interfaces:**

```typescript
type SettingEffect = "hotReload" | "restartRequired";

interface SettingDefinition<T> {
  key: string;
  schema: ZodType<T>;
  defaultValue: T;
  effect: SettingEffect;
  secret?: boolean;
  envOverride?: { varName: string };
  group: string;
  label: string;
}

interface EffectiveSetting {
  key: string;
  value: unknown; // secrets: never plaintext in API layer — service keeps secrets in memory separately
  source: "env" | "database" | "default";
  effect: SettingEffect;
  isSecret: boolean;
  isSet: boolean; // for secrets
  envVar?: string;
}

export function createAppConfigService(
  /* db, key */
): {
  load(): Promise<void>;
  get<T>(key: string): T;
  getEffectiveMeta(key: string): EffectiveSetting;
  listEffective(): EffectiveSetting[];
  set(key: string, value: unknown, actorUserId: string): Promise<{ pendingRestart: boolean }>;
  onChange(key: string, fn: (value: unknown) => void): () => void;
  isRestartPending(): boolean;
  clearRestartPending(): Promise<void>; // on successful boot after apply
};
```

**Merge algorithm:** for each registry key: if `envOverride` and `process.env[var]` non-empty → parse/validate → source env; else if DB row → decrypt if secret → validate → source database; else default.

**set():** validate → encrypt if secret → upsert `app_settings` → audit (redact secrets) → if hotReload notify subscribers + update memory; if restartRequired set pending flag (do not update “applied” memory for restart keys until reboot — or update stored but keep `get()` returning old applied until restart; prefer: memory always reflects **effective for next boot** for restart keys while `getApplied()` used by live Better Auth stays from boot snapshot).

**Simplest correct model for Phase 1:**

- Keep `bootSnapshot` (what process started with) and `storedEffective` (what DB+env say now).
- Live consumers of hot keys read `storedEffective` (updated on set).
- Live consumers of restart keys read `bootSnapshot` until process restart.
- `pendingRestart` = any restart-required key where `storedEffective !== bootSnapshot`.

- [ ] **Step 1: Unit tests for precedence, secret mask path, hot vs restart pending.**

- [ ] **Step 2: Implement registry + service.**

- [ ] **Step 3: Tests PASS.**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): add settings registry and app config service"
```

---

### Task 6: Wire consumers (logging level, graphql timing, poll interval) + restart mutation path

**Files:**

- Modify: `server/src/lib/logging/index.ts` — export way to `setLevel(level)` on the pino logger
- Modify: `logging` package only if needed to expose level mutation; otherwise `log.level = newLevel` on pino instance
- Modify: `server/src/graphql/request-timing.ts` — read from app config `graphql.timing` instead of raw env when config loaded
- Modify: `server/src/index.ts` — `await appConfig.load()`; subscribe poll interval; on boot `clearRestartPending` if snapshots match; register shutdown
- Modify: Strava webhook poller start to read interval from config and resubscribe on change
- Modify: `server/src/lib/strava-event-source.ts` (or token/proxy readers) — `proxyApiKey` from config for hot path
- Modify: `auth-config` / auth init — read `betterAuth.baseUrl` / `client.url` from **boot** config snapshot (env override still works via merge at load)
- Modify: `compose.yaml` — `restart: unless-stopped`
- Modify: `.env.example`

**Restart:**

```typescript
// GraphQL mutation handler (Task 7) calls:
export function requestProcessRestart(): void {
  setTimeout(() => {
    process.exit(0);
  }, 100);
}
```

- [ ] **Step 1: Tests that changing `logging.level` via service invokes subscriber / visible level change.**

- [ ] **Step 2: Wire boot + subscribers + compose restart policy.**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(server): wire hot-reload settings and docker restart policy"
```

---

### Task 7: GraphQL admin API + permission checks

**Files:**

- Create: `server/src/graphql/schema/admin.ts`
- Modify: `server/src/graphql/schema/index.ts`
- Modify: `server/src/graphql/context.ts` — load `appPermissions: Set<string> | null` for session users
- Create: `server/src/services/admin-users.ts`
- Test: `server/src/test/admin-rbac.test.ts`, `server/src/test/admin-config.test.ts`

**GraphQL shape (implement exactly):**

```graphql
enum AdminSettingSource {
  env
  database
  default
}
enum AdminSettingEffect {
  hotReload
  restartRequired
}

type AdminSetting {
  key: String!
  value: JSON # null when secret
  isSecret: Boolean!
  isSet: Boolean!
  source: AdminSettingSource!
  effect: AdminSettingEffect!
  envVar: String
  label: String!
  group: String!
}

type AdminSettingsPayload {
  settings: [AdminSetting!]!
  pendingRestart: Boolean!
}

type AdminUser {
  id: ID!
  email: String!
  name: String!
  role: String! # admin | user
}

type AdminConfigAuditEntry {
  id: ID!
  actorUserId: String
  key: String!
  oldValue: String
  newValue: String
  createdAt: DateTime!
}

extend type Query {
  adminSettings: AdminSettingsPayload!
  adminUsers: [AdminUser!]!
  adminConfigAudit(limit: Int = 50): [AdminConfigAuditEntry!]!
}

input UpdateAdminSettingInput {
  key: String!
  value: JSON # omit or null for secrets means leave unchanged ONLY if you add a separate flag; Phase 1: require value for non-secrets; for secrets empty string rejected — use isSet replace semantics: value required to rotate
}

extend type Mutation {
  updateAdminSettings(inputs: [UpdateAdminSettingInput!]!): AdminSettingsPayload!
  restartServer: Boolean!
  assignUserRole(userId: ID!, role: String!): AdminUser!
}
```

**AuthZ helpers:**

```typescript
export function requireAppPermission(context: GraphQLContext, permission: AppPermission): string {
  const userId = requireUserId(context);
  if (context.authMethod === "apiKey") {
    throw new HttpError(403, "Admin API requires session authentication");
  }
  if (!context.appPermissions?.has(permission)) {
    throw new HttpError(403, "Forbidden");
  }
  return userId;
}
```

- [ ] **Step 1: Failing tests — user role cannot read adminSettings; admin can; update + audit row; assignUserRole.**

- [ ] **Step 2: Implement resolvers + context permissions.**

- [ ] **Step 3: Tests PASS.**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): add GraphQL admin settings and user role APIs"
```

---

### Task 8: Admin UI (Configuration, Users, Audit)

**Files:**

- Modify: `client/src/router.tsx` — routes under `/settings/admin/configuration`, `/settings/admin/users`, `/settings/admin/audit` (or `/admin/...`); gate client-side by attempting query (server enforces)
- Modify: `client/src/components/SettingsNav.tsx` — show Admin links only when `adminSettings` query succeeds (or dedicated `adminMe` later; Phase 1: try/catch hide)
- Create: feature module `client/src/features/admin/` — api hooks, ConfigurationPage, UsersPage, AuditPage
- Modify: `client/src/lib/graphql/operations.ts`

**UI requirements:**

- Configuration: grouped fields from `adminSettings`; enums as selects; booleans as switches; secrets masked with “replace” input; source badge; banner when `pendingRestart` + Restart button calling `restartServer`
- Users: table email/name/role select → `assignUserRole`
- Audit: simple table of recent entries
- Follow existing settings page styling (shadcn); icon+text or tooltip a11y rules

- [ ] **Step 1: Operations + hooks.**

- [ ] **Step 2: Pages + nav.**

- [ ] **Step 3: Manual smoke (or Playwright if env ready): login as seed admin, change `logging.level`, see effect; set restart-required flag; restart button.**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(client): add admin configuration, users, and audit pages"
```

---

### Task 9: Docs, env example, verify

**Files:**

- Modify: `.env.example`, `compose.yaml` (if not done), optionally short note in `AGENTS.md` under conventions (admin bootstrap user + config layers) — only if concise
- Run: `npm run verify`

- [x] **Step 1: Ensure `.env.example` documents `CONFIG_ENCRYPTION_KEY` and bootstrap admin credentials warning.**

- [x] **Step 2: `npm run verify` — fix failures.**

- [x] **Step 3: Commit**

```bash
git commit -m "docs: document runtime config bootstrap and encryption key"
```

---

## Phase 1 out of scope (do not implement here)

- OAuth/tsidp provider map in DB
- Proxy process admin
- Editing role/permission definitions in UI
- Hot-reloading Better Auth in-process (restart only)
- API-key access to admin GraphQL
- Migrating all remaining env vars

## Later phases

See spec roadmap Phases 2–4. Write separate implementation plans when starting those.

## Self-check vs spec

| Spec item                            | Task               |
| ------------------------------------ | ------------------ |
| DB settings + dotted keys            | 2, 5               |
| Registry + precedence + env override | 5, 6               |
| AES-GCM secrets                      | 3, 5               |
| RBAC + seed admin                    | 2, 4               |
| Users list + assign role             | 7, 8               |
| GraphQL admin                        | 7                  |
| Hot-reload sample keys               | 5, 6               |
| Restart path for Better Auth URLs    | 5, 6, 7            |
| Audit log                            | 2, 5, 7, 8         |
| Admin UI                             | 8                  |
| Docker restart policy                | 6                  |
| Small Phase 1 key set only           | Global Constraints |
