# MyBike

Track your bikes and the interchangeable components you swap between them.

## Development

```bash
direnv allow
npm install
cp .env.example .env   # then set BETTER_AUTH_SECRET (see Authentication below)
npm run -w server db:migrate   # create/open the local Turso Database file + tables (first run only)
npm run -w server dev           # Backend on :3001
npm run -w client dev           # Frontend on :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend.

## Authentication

MyBike uses [better-auth](https://www.better-auth.com) with email/password and HTTP-only session cookies. All bike data is scoped per user.

Set these environment variables for the server (see `.env.example`):

| Variable             | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Secret for signing sessions (32+ chars; `openssl rand -base64 32`)        |
| `BETTER_AUTH_URL`    | Public URL of the API (`http://localhost:3001` in dev)                    |
| `CLIENT_URL`         | Frontend origin for CORS/trusted origins (`http://localhost:5173` in dev) |

If unset in development, the server falls back to built-in defaults (not suitable for production).

## Logging

The server and Strava webhook proxy use [Pino](https://getpino.io) via the shared [`logging`](logging/) workspace package. Each service calls `createLogging({ service, defaultLogFilePath })` so they share transports, redaction, and context helpers while keeping separate log files and service names.

In development you get colorized console output plus a JSON log file; in production logs go to stdout (JSON) and optionally to a file. Docker deployments should rely on stdout for log aggregation.

| Variable        | Default (dev)                | Purpose                                                                        |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `LOG_LEVEL`     | `debug` (dev), `info` (prod) | Minimum level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `silent` |
| `LOG_FILE_PATH` | per-service (see below)      | Override log file path (parent dirs created automatically)                     |
| `LOG_TO_FILE`   | `true`                       | Set `false` to disable file output (stdout only)                               |

Default log files when `LOG_FILE_PATH` is unset: `server/data/mybike.log` (API) and `strava-webhook-proxy/data/proxy.log` (webhook proxy).

**Adding logs in server or proxy code:**

```ts
import { child, getLog, withLogContext } from "./lib/logging/index.js";

// Module-level component logger (simple, static context)
const log = child({ component: "strava" });
log.info({ athleteId, durationMs }, "Strava sync complete");

// Dynamic context for a call chain (Serilog-style)
await withLogContext({ athleteId, operation: "fetchActivities" }, async () => {
  getLog().info({ status: 200 }, "Strava API response");
});
```

- Use **`child()`** for fixed component context (e.g. `component: "strava"`).
- Use **`withLogContext()`** when context applies only to a function or async flow.
- Inside HTTP handlers, prefer **`req.log`** (includes `requestId`; authenticated routes also get `userId`).

Sensitive fields (`authorization`, `accessToken`, `refreshToken`, cookies, passwords) are redacted automatically. Do not log OAuth payloads, session tokens, or Strava credentials explicitly.

**Migrating an existing database:** migration `0003` creates auth tables and adds `user_id` to `bikes`. Any bikes created before auth had no owner, so that migration clears existing bikes and components before adding the column. Back up `server/data/mybike.db` first if you need to preserve data.

Register at `/register`, then sign in at `/login`. Email/password and Strava OAuth are both supported when `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` are set (see `.env.example`). Strava login and the integrations connect flow share the same stored tokens — signing in with Strava counts as connected for sync and import.

## Build

```bash
npm run -w server build
npm run -w client build
```

## Database

Turso Database via Drizzle ORM. By default the server uses a **local file** at `DB_PATH` (default `server/data/mybike.db`) through `@tursodatabase/database`. Existing SQLite files open as-is.

For **Turso Cloud** (remote-only, no local volume required), set both:

| Variable             | Purpose                               |
| -------------------- | ------------------------------------- |
| `TURSO_DATABASE_URL` | `libsql://…` URL from `turso db show` |
| `TURSO_AUTH_TOKEN`   | Token from `turso db tokens create`   |

Runtime: local file uses `@tursodatabase/database` + `drizzle-orm/tursodatabase/database`;
Cloud uses `@tursodatabase/serverless/compat` + public `drizzle-orm/libsql`
(`@libsql/client` is installed only because Drizzle’s libsql entry imports it — we
pass the Turso compat client, we do not open a second connection through libsql).

The Turso-safe migrator lives in `shared` (`runDrizzleMigrations`) and is wrapped
by server/proxy for logging.

One-time import of a local file into Cloud:

```bash
turso db create mybike --from-file ./server/data/mybike.db
turso db show mybike --url
turso db tokens create mybike
```

Alternatively, point `DB_PATH` (or `SQLITE_IMPORT_PATH`) at your old local file while
running against Turso Cloud — on the first startup with `RUN_MIGRATIONS=true`, the server
applies schema migrations, then copies bike/domain data once. Completion is recorded in
`<local-db>.imported` on the mounted volume (and in remote `__mybike_meta` when Turso
accepts the write), so the import never runs again on restart.

After a Cloud import, recreate GraphQL API keys in the UI if MCP/API access fails — imported
keys may not match what clients send after the migration.

After a Cloud import, the app migrator repairs missing tables and journal
mismatches on boot. Re-applying an already-applied migration runs **schema
statements only** (CREATE/ALTER), never one-time data fixes such as `DELETE FROM
bikes`. Prefer a single container applying migrations
(`RUN_MIGRATIONS=true`); avoid multiple replicas migrating the same Cloud DB
at once.

`drizzle-kit` helpers (`db:generate`, `db:push`, `db:studio`) still target the
**local file** in `drizzle.config.ts` — use the Turso dashboard/CLI for Cloud
inspection, or point `DB_PATH` at a local copy.

| What                                     | Command                         |
| ---------------------------------------- | ------------------------------- |
| Generate a migration from schema changes | `npm run -w server db:generate` |
| Apply pending migrations                 | `npm run -w server db:migrate`  |
| Push schema directly (interactive)       | `npm run -w server db:push`     |
| Inspect local data                       | `npm run -w server db:studio`   |

## Docker images

GitHub Actions publishes container images to [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) on pushes to `master` and on `v*.*.*` tags:

| Image                                         | Use                                       |
| --------------------------------------------- | ----------------------------------------- |
| `ghcr.io/<owner>/mybike`                      | Full MyBike app (see root `compose.yaml`) |
| `ghcr.io/<owner>/mybike-strava-webhook-proxy` | Public Strava webhook relay               |

## Strava webhook proxy

If MyBike runs on a private network (e.g. Tailscale), deploy the **strava-webhook-proxy** on a small public VPS so Strava can deliver webhooks. MyBike polls the proxy with an API key.

Full deployment steps, compose template, and MyBike configuration: **[strava-webhook-proxy/README.md](strava-webhook-proxy/README.md)**.
