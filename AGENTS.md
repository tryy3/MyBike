# AGENTS.md

## Repo Layout

```
MyBike/
├── server/          # Express + TypeScript API
│   └── src/index.ts # Entry point
├── client/          # React + Vite + TypeScript frontend
│   └── src/         # React components
├── flake.nix        # Nix devShell
└── package.json     # npm workspace root
```

## Commands

| What | Command |
|------|---------|
| Server dev | `npm run -w server dev` |
| Client dev | `npm run -w client dev` |
| Server typecheck | `npm run -w server typecheck` |
| Client typecheck | `npm run -w client typecheck` |
| Server lint | `npm run -w server lint` |
| Client lint | `npm run -w client lint` |
| Format all | `npm run -w server format && npm run -w client format` |

## Conventions

- TypeScript strict mode throughout
- ESM modules everywhere
- Server listens on `PORT` env var (default 3001)
- Client dev server proxies `/api` to `http://localhost:3001`

**After making changes, always run both `lint` and `typecheck` for the affected package.**
