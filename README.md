# MyBike

Track your bikes and the interchangeable components you swap between them.

## Development

```bash
direnv allow
npm install
npm run -w server db:migrate   # create the SQLite DB + tables (first run only)
npm run -w server dev           # Backend on :3001
npm run -w client dev           # Frontend on :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend.

## Build

```bash
npm run -w server build
npm run -w client build
```

## Database

SQLite via Drizzle ORM. The DB lives at `DB_PATH` (default `server/data/mybike.db`).

| What | Command |
|------|---------|
| Generate a migration from schema changes | `npm run -w server db:generate` |
| Apply pending migrations | `npm run -w server db:migrate` |
| Push schema directly (interactive) | `npm run -w server db:push` |
| Inspect data | `npm run -w server db:studio` |