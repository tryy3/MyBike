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