# AGENTS.md

## Repo Layout

```
MyBike/
├── shared/          # Zod schemas + inferred types (imported by server & client)
│   └── src/
├── server/          # Express + TypeScript API
│   ├── src/
│   │   ├── db/      # Drizzle schema + SQLite client
│   │   ├── lib/     # errors, validation helpers
│   │   ├── routes/  # bikes, components
│   │   └── index.ts # Express app entry point
│   ├── drizzle/     # Generated SQL migrations
│   ├── scripts/     # migrate.ts runner
│   └── drizzle.config.ts
├── client/          # React + Vite + TypeScript frontend
│   └── src/
│       ├── routes/        # TanStack Router route components
│       ├── features/      # bikes & components (api + forms + cards)
│       ├── components/ui/ # shadcn primitives
│       └── lib/          # api client, query client, utils
├── flake.nix        # Nix devShell
└── package.json     # npm workspace root (server, client, shared)
```

## Commands

| What | Command |
|------|---------|
| Server dev | `npm run -w server dev` |
| Client dev | `npm run -w client dev` |
| Shared typecheck | `npm run -w shared typecheck` |
| Server typecheck | `npm run -w server typecheck` |
| Client typecheck | `npm run -w client typecheck` |
| Shared lint | `npm run -w shared lint` |
| Server lint | `npm run -w server lint` |
| Client lint | `npm run -w client lint` |
| Format all | `npm run -w server format && npm run -w shared format && npm run -w client format` |
| Generate migration | `npm run -w server db:generate` |
| Apply migrations | `npm run -w server db:migrate` |
| Push schema (interactive) | `npm run -w server db:push` |
| Drizzle Studio | `npm run -w server db:studio` |

## Conventions

- TypeScript strict mode throughout
- ESM modules everywhere
- Server listens on `PORT` env var (default 3001)
- SQLite database file at `DB_PATH` env var (default `server/data/mybike.db`)
- Client dev server proxies `/api` to `http://localhost:3001`
- Validation schemas live in `shared/` and are reused by both server and client (zod); client forms use react-hook-form + `@hookform/resolvers/zod`
- Component categories are a fixed, hardcoded set in `shared/src/categories.ts` (`CATEGORIES` — frame, fork, crankset, … plus an `other` catchall). They are always visible and cannot be created/deleted/edited.
- Components live under a bike + category (`components` table). One active component per (bike, category) is enforced server-side (transaction + unique partial index); clients set it via `PATCH /api/components/:id/activate`.
- After mutations the client invalidates the affected TanStack Query keys and refetches from the server

**After making changes, always run both `lint` and `typecheck` for the affected package(s) — including `shared` when you touch schemas.**

## First run / fresh checkout

```bash
npm install
npm run -w server db:migrate   # create the SQLite DB + tables
npm run -w server dev          # API on :3001
npm run -w client dev          # UI on :5173
```

## Cursor Cloud specific instructions

Cloud agents run on a snapshot-managed environment (the previous `.cursor/environment.json` + Dockerfile were removed) that already has **Node 26** available. The startup update script runs `npm install`, builds `shared`, and applies DB migrations so a fresh agent is ready for dev servers and typecheck.

If you edit anything under `shared/src`, rebuild with `npm run -w shared build` before running server/client dev or typecheck — `tsx watch` does **not** recompile `shared`.

Other notes:

- `.env` is optional in dev (the server has built-in auth fallbacks), but recommended: `cp .env.example .env` and set `BETTER_AUTH_SECRET`. `.env` is gitignored.
- Node: requires **Node 26+** (`engines` in root `package.json`, `.nvmrc`, `flake.nix`). The server uses the built-in `node:sqlite` driver (no native addon rebuild).
- **Node version / nvm override (important):** the Cursor exec-daemon injects `/exec-daemon` into `PATH` ahead of nvm's bin, and `/exec-daemon/node` is **v22** — so without an override, `node` resolves to v22. We force **nvm's v26** by (a) `nvm alias default 26` and (b) symlink shims in `~/.local/bin` (`node`/`npm`/`npx` → the nvm v26 binaries). `~/.local/bin` is always earlier in `PATH` than `/exec-daemon` (via `~/.profile`, plus a guard in `~/.bashrc`), so the shims win in every shell/tool/update-script context. Both `~/.local/bin` and `~/.nvm` live in the home dir, so this persists in the snapshot. If a fresh agent ever shows `node -v` = v22, re-create the shims: `NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm alias default 26; d=$(dirname "$(nvm which default)"); for b in node npm npx; do ln -sfn "$d/$b" "$HOME/.local/bin/$b"; done`. Do **not** edit `/exec-daemon` (root-owned daemon infra).
- Run both dev servers together: API `npm run -w server dev` (:3001) and UI `npm run -w client dev` (:5173). The client proxies `/api` → `:3001`.
- Auth is cookie-based (better-auth). Unauthenticated `/api/*` requests return `401` — this is expected, not a failure. Register at `/register`, then use the app.
- The "Add component" form requires a non-empty **Name** field (min 1 char) in addition to brand/model; component categories are the fixed granular set from `shared/src/categories.ts` (e.g. separate "Front wheel"/"Rear wheel", no combined "Wheels").
- Standard lint/typecheck/test/build commands live in the **Commands** table above and `package.json` scripts; the aggregate `npm test` runs `shared` + `server` vitest suites.