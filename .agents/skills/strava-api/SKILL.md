---
name: strava-api
description: Integrates with the Strava API v3 using OAuth2, webhooks, and rate-limit-aware requests. Use when adding or changing Strava features, OAuth flows, activity/gear sync, webhooks, or debugging Strava API errors in MyBike.
---

# Strava API

## Authentication policy

When interacting with Strava, **prefer OAuth** ([authentication docs](https://developers.strava.com/docs/authentication/)).

Strava also allows generating a personal access token from [API settings](https://www.strava.com/settings/api) for simple, single-athlete experiments. That is fine for one-off scripts or manual testing, but **not for MyBike** — this app connects multiple users and must store per-user access/refresh tokens.

| Approach | When to use |
|----------|-------------|
| **OAuth 2.0** (required here) | Multi-user apps, refresh tokens, scoped access, webhooks |
| Personal access token | Solo scripts, quick API exploration, Swagger playground |

Register the app at https://www.strava.com/settings/api to get `client_id` and `client_secret`. Never expose the client secret to the client or commit it.

## Official documentation

| Topic | URL |
|-------|-----|
| Authentication | https://developers.strava.com/docs/authentication/ |
| API reference | https://developers.strava.com/docs/reference/ |
| Webhooks | https://developers.strava.com/docs/webhooks/ |
| Rate limits | https://developers.strava.com/docs/rate-limits/ |
| Brand guidelines | https://developers.strava.com/guidelines |
| API agreement | https://www.strava.com/legal/api |

Base URL for all resource requests: `https://www.strava.com/api/v3`

## MyBike integration map

| Concern | Location |
|---------|----------|
| HTTP client + OAuth helpers | `server/src/lib/strava-client.ts` |
| Activity sync + webhook processor | `server/src/lib/strava-activity-sync.ts`, `strava-webhook-processor.ts`, `strava-webhook-poller.ts` |
| Webhook event source (proxy pull) | `server/src/lib/strava-event-source.ts` |
| Public webhook relay | `strava-webhook-proxy/` (`GET/POST /webhook/strava`, `GET /api/events`) |
| Routes (connect, callback, import, sync) | `server/src/routes/strava.ts` |
| Client API | `client/src/features/strava/api.ts` |
| Shared schemas | `shared/src/schemas/strava.ts` |
| Env vars | `.env.example` — `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, `STRAVA_SCOPES` |

Default scopes in this project: `read,activity:read_all,profile:read_all`.

Tokens are stored in the better-auth `account` table (`providerId: "strava"`). Refresh when expiry is within 60 seconds.

## OAuth flow (web)

1. **Authorize** — redirect athlete to `GET https://www.strava.com/oauth/authorize` with `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, and `approval_prompt` (`auto` or `force`).
2. **Callback** — Strava redirects with `code` and `scope`. Validate `state` (CSRF). On denial, `error=access_denied`.
3. **Token exchange** — `POST https://www.strava.com/oauth/token` with JSON body: `client_id`, `client_secret`, `code`, `grant_type=authorization_code`.
4. **API calls** — `Authorization: Bearer <access_token>` on `https://www.strava.com/api/v3/*`.
5. **Refresh** — when access token expires (~6 hours), `POST https://www.strava.com/oauth/token` with `grant_type=refresh_token`. **Always persist the new refresh token** — old refresh tokens are invalidated immediately.
6. **Deauthorize** — `POST https://www.strava.com/oauth/deauthorize?access_token=...` (legacy) or `POST https://www.strava.com/oauth/revoke` with HTTP Basic Auth (`client_id:client_secret`).

### Scopes (request only what you need)

| Scope | Access |
|-------|--------|
| `read` | Public segments, routes, profile, posts, events, clubs |
| `read_all` | Private routes, segments, events |
| `profile:read_all` | Full profile even when visibility is restricted |
| `profile:write` | Update weight, FTP; star segments |
| `activity:read` | Activities visible to Everyone/Followers (no privacy zone) |
| `activity:read_all` | All activities including Only You + privacy zone data |
| `activity:write` | Create/upload/edit activities |

`activity:read` is the minimum scope for **activity webhooks**. MyBike uses `activity:read_all` to import private rides and gear-linked mileage.

## Endpoints used by MyBike

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/athlete/activities` | Paginated ride history (`per_page` max 200, `page`, optional `after`/`before` epoch filters) |
| `GET` | `/athlete` | Athlete profile including `bikes[]` (`SummaryGear`) |
| `GET` | `/gear/{id}` | Resolve gear name/details when missing from activity list |
| `POST` | `https://www.strava.com/oauth/token` | Exchange code / refresh token (not under `/api/v3`) |
| `GET` | `https://www.strava.com/oauth/authorize` | Start OAuth (not under `/api/v3`) |

Key activity fields for mileage sync: `id`, `gear_id`, `distance` (meters), `moving_time` (seconds), `start_date`, `gear` (optional embedded summary).

For the full endpoint catalog, see [reference.md](reference.md).

## Webhooks (preferred over polling)

Strava encourages webhooks instead of polling activities. See https://developers.strava.com/docs/webhooks/

- One subscription per application: `POST/GET/DELETE https://www.strava.com/api/v3/push_subscriptions`
- Subscription creation triggers a validation `GET` to `callback_url` with `hub.mode`, `hub.challenge`, `hub.verify_token` — respond `200` within 2s with JSON `{ "hub.challenge": "<value>" }`
- Event `POST` payloads include `object_type` (`activity`|`athlete`), `aspect_type` (`create`|`update`|`delete`), `object_id`, `owner_id`, `subscription_id`, `event_time`, and optional `updates`
- Acknowledge each event with `200` within 2s; process asynchronously
- Respect activity privacy per granted scopes (`activity:read` vs `activity:read_all`)

MyBike syncs via manual `/api/strava/sync`, background proxy polling (when configured), and import. Webhooks hit the public `strava-webhook-proxy` relay; the private server pulls events and fetches activity details from Strava.

## Rate limits

Defaults (after upgrading from Single Player Mode on the API settings page):

| Bucket | 15-minute | Daily |
|--------|-----------|-------|
| Overall | 200 (upgradable to 400) | 2,000 (upgradable to 4,000) |
| Non-upload reads | 100 | 1,000 |

Upload endpoints (`POST /activities`, `POST /uploads`, upload media) have separate limits.

Check response headers on every request:

- `X-RateLimit-Limit` / `X-RateLimit-Usage` — overall
- `X-ReadRateLimit-Limit` / `X-ReadRateLimit-Usage` — read endpoints

`429 Too Many Requests` when exceeded. Limits reset at :00/:15/:30/:45 and midnight UTC.

**Practices for MyBike:**

- Paginate `/athlete/activities` with `per_page=200`; use `after` timestamp for incremental sync instead of re-fetching all pages
- Batch gear lookups; avoid N+1 `/gear/{id}` calls when names are already on activities or `/athlete` bikes
- Prefer webhooks over periodic full sync for active users
- Log and backoff on `429`

New apps start in **Single Player Mode** (1 athlete). Upgrade access from https://www.strava.com/settings/api before connecting more users.

## Implementation checklist

When adding Strava functionality:

1. Use OAuth — extend `strava-client.ts`, not hardcoded tokens
2. Add only required scopes; document why in PR/commit
3. Handle `401` (expired/revoked token) and `429` (rate limit)
4. Persist refreshed tokens atomically (refresh token rotation invalidates the old one)
5. Validate OAuth `state` on callback
6. Keep client secret server-side only
7. Respect Strava brand guidelines for "Connect with Strava" buttons
8. Run `vp check` after changes; update `shared` schemas if API shapes change

## Error handling

| Status | Meaning | Action |
|--------|---------|--------|
| `401` | Invalid/expired/revoked token | Refresh once; if still failing, prompt reconnect |
| `403` | Insufficient scope | Re-authorize with broader scope |
| `429` | Rate limited | Read headers, exponential backoff |
| `502` (mapped) | Strava upstream error | Surface `message` from Strava JSON body |

Strava error bodies: `{ "message": "...", "errors": [...] }`

## Additional resources

- Full endpoint reference: [reference.md](reference.md)
- Swagger playground: https://www.strava.com/settings/api (set callback domain to `developers.strava.com` for docs playground)
