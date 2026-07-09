# AGENTS.md

## Repo Layout

```
MyBike/
├── shared/          # Zod schemas + inferred types (imported by server & client)
│   └── src/
├── logging/         # Shared Pino logging (server + strava-webhook-proxy)
│   └── src/
├── server/          # Express + TypeScript API
│   ├── src/
│   │   ├── db/      # Drizzle schema + SQLite client
│   │   ├── graphql/ # Yoga + Pothos schema (bike/component/stats domain)
│   │   ├── lib/     # errors, validation helpers
│   │   ├── routes/  # REST legacy (CSV, Strava, activities)
│   │   ├── services/ # Business logic shared by GraphQL + REST
│   │   └── index.ts # Express app entry point
│   ├── drizzle/     # Generated SQL migrations
│   ├── scripts/     # migrate.ts runner
│   └── drizzle.config.ts
├── client/          # React + Vite + TypeScript frontend
│   └── src/
│       ├── routes/        # TanStack Router route components
│       ├── features/      # bikes & components (api + forms + cards)
│       ├── components/ui/ # shadcn primitives
│       └── lib/          # api client, graphql client, query client, utils
├── strava-webhook-proxy/  # Public Strava webhook relay + pull API (separate deploy)
│   └── src/
├── flake.nix        # Nix devShell
└── package.json     # npm workspace root (server, client, shared, strava-webhook-proxy)
```

## Commands

Install the Vite+ CLI once: `curl -fsSL https://vite.plus | bash`. Run `vp env off` if vp's Node manager conflicts with nvm/Nix.

| What                        | Command                                                |
| --------------------------- | ------------------------------------------------------ |
| Install deps                | `vp install` (or `npm install`)                        |
| Server dev                  | `npm run -w server dev`                                |
| Client dev                  | `npm run -w client dev`                                |
| Webhook proxy dev           | `npm run -w strava-webhook-proxy dev`                  |
| Format + lint + typecheck   | `vp check`                                             |
| Auto-fix format/lint        | `vp check --fix`                                       |
| Run tests                   | `npm test` (runs shared + server via `vp run -r test`) |
| Full verify (CI equivalent) | `npm run verify`                                       |
| Generate migration          | `npm run -w server db:generate`                        |
| Apply migrations            | `npm run -w server db:migrate`                         |
| Push schema (interactive)   | `npm run -w server db:push`                            |
| Drizzle Studio              | `npm run -w server db:studio`                          |
| Proxy migrate               | `npm run -w strava-webhook-proxy db:migrate`           |
| Strava webhook subscribe    | `npm run -w strava-webhook-proxy subscribe`            |

## Quality gates

- **Pre-commit** (`.vite-hooks/pre-commit`): `vp staged` — formats and lints staged files
- **Pre-push** (`.vite-hooks/pre-push`): `npm run verify` — full check + tests before push
- **CI** (`.github/workflows/ci.yml`): `vp check` + `vp run -r test` on every PR and push to `master`

Wire hooks after clone if not already active:

```bash
git config core.hooksPath .vite-hooks
```

Set `VITE_GIT_HOOKS=0` in CI/Docker to skip hook installation. Emergency bypass: `git commit --no-verify` / `git push --no-verify`.

In GitHub **Settings → Branches** for `master`, require the **CI / Check and test** status check before merging.

## Conventions

- TypeScript strict mode throughout
- ESM modules everywhere
- Server listens on `PORT` env var (default 3001)
- SQLite database file at `DB_PATH` env var (default `server/data/mybike.db`)
- Client dev server proxies `/api` and `/graphql` to `http://localhost:3001`
- Validation schemas live in `shared/` and are reused by both server and client (zod); client forms use react-hook-form + `@hookform/resolvers/zod`
- Component categories are a fixed, hardcoded set in `shared/src/categories.ts` (`CATEGORIES` — frame, fork, crankset, … plus an `other` catchall). They are always visible and cannot be created/deleted/edited.
- Components live under a bike + category (`components` table). One active component per (bike, category) is enforced server-side (transaction + unique partial index); clients set it via the `activateComponent` GraphQL mutation.
- After mutations the client invalidates the affected TanStack Query keys and refetches from the server
- **Strava webhooks (private hosting):** deploy `strava-webhook-proxy` on a public URL; MyBike pulls events via `STRAVA_WEBHOOK_PROXY_URL` + API key. One-time: set `STRAVA_WEBHOOK_CALLBACK_URL`, `STRAVA_VERIFY_TOKEN`, run `subscribe`. Main server polls on an interval and on manual sync.

## API layers (GraphQL vs REST)

**Default for bike/component/stats reads and mutations:** GraphQL at `POST /graphql` (Yoga). Schema lives in `server/src/graphql/`. Business logic lives in `server/src/services/`.

| GraphQL                                                    | Replaces (removed REST)                                   |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `Query.bikes`, `Query.bike`                                | `GET /api/bikes`, `GET /api/bikes/:id`                    |
| `Mutation.createBike`, `updateBike`, `deleteBike`          | `POST/PUT/DELETE /api/bikes`                              |
| Component CRUD + `activateComponent` + `reorderComponents` | `POST/PATCH/DELETE /api/components`, `PATCH .../activate` |
| `Query.garageStats`, `Bike.rideStats`, `Component.wear`    | `GET /api/stats/garage`, `GET /api/stats/bikes/:id`       |
| `Query.fieldSuggestions`                                   | `GET /api/field-suggestions`                              |

**Stay on REST when:**

- CSV file import/export (`/api/bikes/:bikeId/components/export.csv`, `.../import`)
- Strava OAuth, sync, webhooks (`/api/strava/*`)
- Activities list/detail (`/api/bikes/:bikeId/activities`, `/api/activities/:id`)
- Better Auth (`/api/auth/*`)
- Health check (`GET /api/health`)

**When touching legacy REST routes, decide:**

- _Small fix_ (bugfix, copy change, validation tweak) → patch the REST route or underlying service directly
- _New field or behavior_ in the bike/component/stats domain → add to GraphQL schema + service; only touch REST if the feature is in the "stays on REST" list above
- _Migrating activities/Strava later_ → follow the same pattern: extract service → Pothos types → client hooks → remove REST

**Validation:** continue using Zod schemas in `shared/`; GraphQL mutation resolvers call `.parse()` on the same schemas.

**GraphQL API keys (LLM / script access):** users create keys at `/settings/api-keys` while logged in (Better Auth `@better-auth/api-key` plugin). Keys authenticate **only** `POST /graphql` via `Authorization: Bearer mbk_…` or `x-api-key`; REST routes remain session-only. Default scope is read-only (`graphql: ["read"]`); write and delete scopes are available when creating a key. Permission constants live in `shared/src/schemas/api-key.ts`.

**After GraphQL changes:** run `npm run verify`; add or update tests in `server/src/test/graphql.test.ts`. Tests that need bike/component setup should use helpers in `server/src/test/graphql-helper.ts`. API key tests live in `server/src/test/api-key-graphql.test.ts`.

**After making changes, run `vp check` for the affected area (or `npm run verify` before pushing). Include `shared` when you touch schemas.**

## First run / fresh checkout

```bash
vp install   # or npm install
npm run -w server db:migrate   # create the SQLite DB + tables
npm run -w server dev          # API on :3001
npm run -w client dev          # UI on :5173
git config core.hooksPath .vite-hooks   # enable pre-commit/pre-push hooks
```

## Cursor Cloud specific instructions

Cloud agents run on a snapshot-managed environment (the previous `.cursor/environment.json` + Dockerfile were removed) that already has **Node 26** available. The startup update script runs `npm install`, builds `shared`, and applies DB migrations so a fresh agent is ready for dev servers and typecheck.

If you edit anything under `shared/src`, rebuild with `npm run -w shared build` before running server/client dev or typecheck — `tsx watch` does **not** recompile `shared`.

Other notes:

- `.env` is optional in dev (the server has built-in auth fallbacks), but recommended: `cp .env.example .env` and set `BETTER_AUTH_SECRET`. `.env` is gitignored.
- Node: requires **Node 26+** (`engines` in root `package.json`, `.node-version`, `flake.nix`). The server uses the built-in `node:sqlite` driver (no native addon rebuild).
- **Node version / nvm override (important):** the Cursor exec-daemon injects `/exec-daemon` into `PATH` ahead of nvm's bin, and `/exec-daemon/node` is **v22** — so without an override, `node` resolves to v22. We force **nvm's v26** by (a) `nvm alias default 26` and (b) symlink shims in `~/.local/bin` (`node`/`npm`/`npx` → the nvm v26 binaries). `~/.local/bin` is always earlier in `PATH` than `/exec-daemon` (via `~/.profile`, plus a guard in `~/.bashrc`), so the shims win in every shell/tool/update-script context. Both `~/.local/bin` and `~/.nvm` live in the home dir, so this persists in the snapshot. If a fresh agent ever shows `node -v` = v22, re-create the shims: `NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm alias default 26; d=$(dirname "$(nvm which default)"); for b in node npm npx; do ln -sfn "$d/$b" "$HOME/.local/bin/$b"; done`. Do **not** edit `/exec-daemon` (root-owned daemon infra).
- Run both dev servers together: API `npm run -w server dev` (:3001) and UI `npm run -w client dev` (:5173). The client proxies `/api` → `:3001`.
- Auth is cookie-based (better-auth). Unauthenticated `/api/*` requests return `401` — this is expected, not a failure. Register at `/register`, then use the app.
- The "Add component" form requires a non-empty **Name** field (min 1 char) in addition to brand/model; component categories are the fixed granular set from `shared/src/categories.ts` (e.g. separate "Front wheel"/"Rear wheel", no combined "Wheels").
- Lint/format/typecheck/test use **Vite+** (`vite.config.ts` at repo root; Oxlint + Oxfmt via `vp check`). Docker production builds still use `npm ci --ignore-scripts` — no `vp` required in the container.
- Standard verify commands are in the **Commands** and **Quality gates** sections; `npm test` runs shared + server test suites via `vp run -r test`.
