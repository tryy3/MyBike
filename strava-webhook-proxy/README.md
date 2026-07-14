# Strava webhook proxy

Public relay for [Strava push subscriptions](https://developers.strava.com/docs/webhooks/). Strava POSTs webhook events to this service; your private MyBike server pulls them over HTTPS with an API key.

Use this when MyBike runs on a home network or Tailscale and cannot receive Strava callbacks directly.

## Architecture

```
Strava  --POST /webhook/strava-->  proxy (public HTTPS)  --Turso DB-->
MyBike  --GET /api/events-------->  proxy (API key)       --poll-->
```

| Endpoint               | Auth                              | Purpose                        |
| ---------------------- | --------------------------------- | ------------------------------ |
| `GET /webhook/strava`  | `STRAVA_VERIFY_TOKEN`             | Strava subscription validation |
| `POST /webhook/strava` | —                                 | Receives and stores events     |
| `GET /api/events`      | `Authorization: Bearer <API_KEY>` | MyBike pulls new events        |
| `GET /api/health`      | —                                 | Health check                   |

## Container image

GitHub Actions publishes multi-arch images to GitHub Container Registry on every push to `master` and on version tags:

```text
ghcr.io/<github-owner>/mybike-strava-webhook-proxy:master
ghcr.io/<github-owner>/mybike-strava-webhook-proxy:<git-sha>
ghcr.io/<github-owner>/mybike-strava-webhook-proxy:<semver>   # on v*.*.* tags
```

Replace `<github-owner>` with your GitHub username or org (e.g. `tryy3`).

### Pull on a private VPS

If the package is private, log in once:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Use a classic PAT with `read:packages`, or a fine-grained token with package read access.

## Deploy on a VPS

You only need Docker and a public HTTPS hostname. No git clone required.

### 1. Prepare files

```bash
mkdir -p ~/strava-proxy && cd ~/strava-proxy
```

Copy from this repo:

- `strava-webhook-proxy/compose.example.yaml` → `compose.yaml`
- `strava-webhook-proxy/.env.example` → `.env`

Edit `compose.yaml` and set the `image` to your GHCR path if it differs from the example.

### 2. Configure secrets

Generate values:

```bash
openssl rand -base64 32   # STRAVA_WEBHOOK_PROXY_API_KEY
openssl rand -hex 16      # STRAVA_VERIFY_TOKEN
```

Fill in `.env`:

```env
STRAVA_WEBHOOK_PROXY_API_KEY=<api-key>
STRAVA_VERIFY_TOKEN=<verify-token>
```

Use the **same** `STRAVA_WEBHOOK_PROXY_API_KEY` on your MyBike server later.

### 3. Start the proxy

```bash
docker compose up -d
docker compose logs -f
```

Verify locally:

```bash
curl http://127.0.0.1:3002/api/health
# {"status":"ok"}
```

### 4. HTTPS reverse proxy

Strava requires HTTPS. Terminate TLS on the same VPS (example with [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy)):

```caddy
hooks.example.com {
    reverse_proxy localhost:3002
}
```

After DNS points at the VPS:

```bash
curl https://hooks.example.com/api/health
```

The compose file binds port `3002` to `127.0.0.1` so only the reverse proxy is exposed publicly.

### 5. Register the Strava webhook (one-time)

From a machine with the repo checked out (not necessarily the VPS), set in the repo root `.env`:

```env
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_WEBHOOK_CALLBACK_URL=https://hooks.example.com/webhook/strava
STRAVA_VERIFY_TOKEN=<same-as-proxy>
```

Then:

```bash
npm run -w strava-webhook-proxy subscribe
```

Copy the subscription `id` from the output into the proxy `.env`:

```env
STRAVA_SUBSCRIPTION_ID=12345
```

Restart the container:

```bash
docker compose up -d
```

Strava allows one push subscription per application. Re-running `subscribe` is a no-op if the callback URL already exists.

## Configure MyBike

On your **private** MyBike server (Tailscale, home lab, etc.), add to `.env`:

```env
STRAVA_WEBHOOK_PROXY_URL=https://hooks.example.com
STRAVA_WEBHOOK_PROXY_API_KEY=<same-api-key-as-proxy>
# optional; default 60000
STRAVA_WEBHOOK_POLL_INTERVAL_MS=60000
```

Restart MyBike. Logs should show:

```text
[strava-webhook] polling proxy every 60000ms
```

The server polls the proxy, imports `activity.create` events, and still supports manual sync if the proxy is unreachable.

## Smoke test

```bash
# Health (public)
curl https://hooks.example.com/api/health

# Pull API (requires API key)
curl -H "Authorization: Bearer $STRAVA_WEBHOOK_PROXY_API_KEY" \
  "https://hooks.example.com/api/events?after_id=0"
```

Upload a Strava activity; within about one poll interval it should appear in MyBike without a manual full sync.

## Operations

| Task         | Command                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| View logs    | `docker compose logs -f`                                                               |
| Restart      | `docker compose restart`                                                               |
| Update image | `docker compose pull && docker compose up -d`                                          |
| Backup DB    | Copy the `strava-proxy-data` Docker volume (SQLite at `/data/strava-webhook-proxy.db`) |

Migrations run automatically on container start (`RUN_MIGRATIONS=true`).

## Troubleshooting

| Symptom                       | Likely cause                                                            |
| ----------------------------- | ----------------------------------------------------------------------- |
| `subscribe` fails with 403    | Proxy not reachable on HTTPS, or `STRAVA_VERIFY_TOKEN` mismatch         |
| MyBike never imports webhooks | Missing `STRAVA_WEBHOOK_PROXY_URL` / `API_KEY` on the **MyBike** server |
| Events ignored                | Wrong `STRAVA_SUBSCRIPTION_ID` on the proxy                             |
| `401` on `/api/events`        | API key mismatch between proxy and MyBike                               |
| Data lost after redeploy      | Volume not mounted; ensure `strava-proxy-data` volume exists            |

## Local development

```bash
npm run -w strava-webhook-proxy dev    # :3002
npm run -w strava-webhook-proxy test
```

See repo root `AGENTS.md` and `.env.example` for full environment variable reference.
