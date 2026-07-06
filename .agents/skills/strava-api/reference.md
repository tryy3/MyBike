# Strava API v3 — Endpoint Reference

Base: `https://www.strava.com/api/v3`  
Auth header: `Authorization: Bearer <access_token>`

OAuth endpoints (not under `/api/v3`):

| Method | URL | Purpose |
|--------|-----|---------|
| `GET` | `https://www.strava.com/oauth/authorize` | Start OAuth |
| `POST` | `https://www.strava.com/oauth/token` | Exchange code / refresh token |
| `POST` | `https://www.strava.com/oauth/deauthorize` | Revoke access (legacy) |
| `POST` | `https://www.strava.com/oauth/revoke` | Revoke token (recommended, Basic Auth) |

---

## Activities

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/activities` | `activity:write` | Create manual activity (form body) |
| `GET` | `/activities/{id}` | `activity:read` / `activity:read_all` | Get activity by ID |
| `PUT` | `/activities/{id}` | `activity:write` | Update activity |
| `GET` | `/athlete/activities` | `activity:read` / `activity:read_all` | List authenticated athlete's activities |
| `GET` | `/activities/{id}/comments` | `activity:read` | List comments |
| `GET` | `/activities/{id}/kudos` | `activity:read` | List kudoers |
| `GET` | `/activities/{id}/laps` | `activity:read` | List laps |
| `GET` | `/activities/{id}/zones` | `activity:read` | Heart rate / power zones |

### `GET /athlete/activities` query parameters

| Param | Type | Notes |
|-------|------|-------|
| `before` | integer | Epoch — activities before this time |
| `after` | integer | Epoch — activities after this time |
| `page` | integer | Default 1 |
| `per_page` | integer | Default 30, max 200 |

Activities with Only You visibility require `activity:read_all`.

---

## Athletes

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/athlete` | `read` | Authenticated athlete (`DetailedAthlete` with `profile:read_all`) |
| `PUT` | `/athlete` | `profile:write` | Update weight, FTP |
| `GET` | `/athlete/zones` | `read` | Heart rate / power zones |
| `GET` | `/athletes/{id}/stats` | `read` | Athlete stats (recent/ytd/all totals) |

`DetailedAthlete` includes `bikes[]` and `shoes[]` as `SummaryGear` arrays.

---

## Gears

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/gear/{id}` | `read` | Equipment details (`DetailedGear`) |

### SummaryGear / DetailedGear fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Gear identifier (used as `gear_id` on activities) |
| `name` | string | User-assigned name |
| `primary` | boolean | Default gear |
| `distance` | float | Total distance logged (meters) |
| `brand_name` | string | Detailed only |
| `model_name` | string | Detailed only |
| `frame_type` | integer | Bike frame type (detailed only) |
| `description` | string | Detailed only |

---

## Streams

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/activities/{id}/streams` | `activity:read` | Time-series data (latlng, altitude, heartrate, etc.) |
| `GET` | `/routes/{id}/streams` | `read` | Route streams |
| `GET` | `/segment_efforts/{id}/streams` | `read` | Segment effort streams |
| `GET` | `/segments/{id}/streams` | `read` | Segment streams |

Stream types: `time`, `distance`, `latlng`, `altitude`, `velocity_smooth`, `heartrate`, `cadence`, `watts`, `temp`, `moving`, `grade_smooth`

---

## Uploads

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `POST` | `/uploads` | `activity:write` | Upload activity file (FIT, GPX, TCX) |
| `GET` | `/uploads/{id}` | `activity:write` | Check upload processing status |

Upload endpoints have separate (higher) rate limits.

---

## Segments & efforts

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/segments/explore` | `read` | Explore segments by bounds |
| `GET` | `/segments/{id}` | `read` | Segment details |
| `PUT` | `/segments/{id}/starred` | `profile:write` | Star/unstar segment |
| `GET` | `/segments/starred` | `read` | Athlete's starred segments |
| `GET` | `/segment_efforts/{id}` | `read` | Segment effort by ID |
| `GET` | `/segments/{id}/all_efforts` | `read` | All efforts on segment |

---

## Routes

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/athletes/{id}/routes` | `read` | List athlete routes |
| `GET` | `/routes/{id}` | `read` | Route details |
| `GET` | `/routes/{id}/export_gpx` | `read` | Export GPX |
| `GET` | `/routes/{id}/export_tcx` | `read` | Export TCX |

---

## Clubs

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/athlete/clubs` | `read` | Athlete's clubs |
| `GET` | `/clubs/{id}` | `read` | Club details |
| `GET` | `/clubs/{id}/members` | `read` | Club members |
| `GET` | `/clubs/{id}/admins` | `read` | Club admins |
| `GET` | `/clubs/{id}/activities` | `read` | Club activity feed |

---

## Webhooks (push subscriptions)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/push_subscriptions` | `client_id` + `client_secret` (form) | Create subscription |
| `GET` | `/push_subscriptions` | `client_id` + `client_secret` (query) | View subscription |
| `DELETE` | `/push_subscriptions/{id}` | `client_id` + `client_secret` (query) | Delete subscription |

Create body (form): `callback_url`, `verify_token`

### Webhook event payload

```json
{
  "aspect_type": "create",
  "event_time": 1516126040,
  "object_id": 1360128428,
  "object_type": "activity",
  "owner_id": 134815,
  "subscription_id": 120475,
  "updates": {}
}
```

Events: activity create/update/delete; athlete deauthorization (`authorized: false`).

---

## Key data models

### SummaryActivity (list response)

Relevant fields for bike mileage apps:

| Field | Type | Notes |
|-------|------|-------|
| `id` | long | Activity ID |
| `name` | string | Activity title |
| `distance` | float | Meters |
| `moving_time` | integer | Seconds |
| `elapsed_time` | integer | Seconds |
| `start_date` | datetime | UTC |
| `start_date_local` | datetime | Local timezone |
| `sport_type` | string | e.g. `Ride`, `MountainBikeRide`, `GravelRide` |
| `type` | string | Deprecated — use `sport_type` |
| `gear_id` | string | Linked equipment ID |
| `private` | boolean | Visibility |
| `trainer` | boolean | Indoor trainer |
| `commute` | boolean | Marked commute |
| `device_watts` | boolean | Power meter present |

### Token response (OAuth)

| Field | Notes |
|-------|-------|
| `access_token` | Short-lived (~6 hours) |
| `refresh_token` | Rotates on each refresh |
| `expires_at` | Unix epoch seconds |
| `expires_in` | Seconds until expiry |
| `athlete` | Summary athlete object |
| `scope` | Space-delimited granted scopes |

---

## Rate limit response headers

```
X-RateLimit-Limit: 200,2000
X-RateLimit-Usage: 45,320
X-ReadRateLimit-Limit: 100,1000
X-ReadRateLimit-Usage: 30,280
```

Format: `15-minute-limit,daily-limit` for both limit and usage.
