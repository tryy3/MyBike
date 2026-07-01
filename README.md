# MyBike

Track your bikes and the interchangeable components you swap between them.

## Development

```bash
direnv allow
npm install
cp .env.example .env   # then set BETTER_AUTH_SECRET (see Authentication below)
npm run -w server db:migrate   # create the SQLite DB + tables (first run only)
npm run -w server dev           # Backend on :3001
npm run -w client dev           # Frontend on :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the backend.

## Authentication

MyBike uses [better-auth](https://www.better-auth.com) with email/password and HTTP-only session cookies. All bike data is scoped per user.

Set these environment variables for the server (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `BETTER_AUTH_SECRET` | Secret for signing sessions (32+ chars; `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Public URL of the API (`http://localhost:3001` in dev) |
| `CLIENT_URL` | Frontend origin for CORS/trusted origins (`http://localhost:5173` in dev) |

If unset in development, the server falls back to built-in defaults (not suitable for production).

**Migrating an existing database:** migration `0003` creates auth tables and adds `user_id` to `bikes`. Any bikes created before auth had no owner, so that migration clears existing bikes and components before adding the column. Back up `server/data/mybike.db` first if you need to preserve data.

Register at `/register`, then sign in at `/login`. OAuth providers can be added later via better-auth `socialProviders`.

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