import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { account, user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { bikes, stravaActivities, stravaBikes } from "../db/schema.js";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import type { StravaWebhookEnvelope } from "shared";
import type { StravaEventSource } from "../lib/strava-event-source.js";
import { processWebhookEvent } from "../lib/strava-webhook-processor.js";
import {
  processPendingWebhookEvents,
  setStravaEventSourceForTests,
} from "../lib/strava-webhook-poller.js";
import { getLastProxyEventId, setLastProxyEventId } from "../lib/strava-webhook-cursor.js";

const app = createApp();
const originalFetch = globalThis.fetch;

function nextAthleteId(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

function mockActivityResponse(activity: {
  id: number;
  gear_id: string;
  distance: number;
  moving_time: number;
  start_date: string;
}) {
  return new Response(JSON.stringify({ ...activity, sport_type: "Ride" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  setLastProxyEventId(0);
  setStravaEventSourceForTests(null);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setStravaEventSourceForTests(null);
});

function seedConnectedUser() {
  const athleteId = nextAthleteId();
  const userId = crypto.randomUUID();
  db.insert(user)
    .values({
      id: userId,
      name: "Webhook Rider",
      email: `webhook-${userId}@example.com`,
      emailVerified: true,
    })
    .run();

  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      accountId: athleteId,
      providerId: "strava",
      userId,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: "read,activity:read_all,profile:read_all",
    })
    .run();

  const bike = db
    .insert(bikes)
    .values({ userId, name: "Webhook Bike", stravaGearId: "gear-webhook-1" })
    .returning()
    .get();

  db.insert(stravaBikes)
    .values({
      userId,
      bikeId: bike.id,
      stravaGearId: "gear-webhook-1",
      componentCreditFrom: "1970-01-01",
    })
    .run();

  return { userId, bikeId: bike.id, athleteId };
}

async function connectStravaAccount(email: string, athleteId?: string) {
  const currentUser = db.select().from(user).where(eq(user.email, email)).get();
  expect(currentUser).toBeDefined();
  db.insert(account)
    .values({
      id: crypto.randomUUID(),
      accountId: athleteId ?? `strava-athlete-${currentUser!.id}`,
      providerId: "strava",
      userId: currentUser!.id,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: "read,activity:read_all,profile:read_all",
    })
    .run();
}

describe("processWebhookEvent", () => {
  it("imports activity create events for linked gear", async () => {
    const { userId, athleteId } = seedConnectedUser();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname === "/api/v3/activities/999001") {
        return mockActivityResponse({
          id: 999001,
          gear_id: "gear-webhook-1",
          distance: 5000,
          moving_time: 1800,
          start_date: new Date().toISOString(),
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const envelope: StravaWebhookEnvelope = {
      id: 1,
      receivedAt: new Date().toISOString(),
      payload: {
        aspect_type: "create",
        event_time: Math.floor(Date.now() / 1000),
        object_id: 999001,
        object_type: "activity",
        owner_id: Number(athleteId),
        subscription_id: 1,
      },
    };

    const outcome = await processWebhookEvent(envelope);
    expect(outcome).toBe("imported");

    const imported = db
      .select()
      .from(stravaActivities)
      .where(eq(stravaActivities.userId, userId))
      .all();
    expect(imported).toHaveLength(1);
    expect(imported[0]?.stravaActivityId).toBe("999001");
  });

  it("skips activity update events", async () => {
    const { athleteId } = seedConnectedUser();

    const outcome = await processWebhookEvent({
      id: 2,
      receivedAt: new Date().toISOString(),
      payload: {
        aspect_type: "update",
        event_time: Math.floor(Date.now() / 1000),
        object_id: 123,
        object_type: "activity",
        owner_id: Number(athleteId),
        subscription_id: 1,
      },
    });

    expect(outcome).toBe("skipped");
  });

  it("disconnects only when Strava token is revoked", async () => {
    const { userId, athleteId } = seedConnectedUser();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname === "/api/v3/athlete") {
        return new Response(JSON.stringify({ id: athleteId }), { status: 401 });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const outcome = await processWebhookEvent({
      id: 3,
      receivedAt: new Date().toISOString(),
      payload: {
        aspect_type: "update",
        event_time: Math.floor(Date.now() / 1000),
        object_id: Number(athleteId),
        object_type: "athlete",
        owner_id: Number(athleteId),
        subscription_id: 1,
        updates: { authorized: "false" },
      },
    });

    expect(outcome).toBe("disconnected");
    expect(db.select().from(account).where(eq(account.userId, userId)).get()).toBeUndefined();
  });

  it("ignores forged deauth when token is still valid", async () => {
    const { userId, athleteId } = seedConnectedUser();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname === "/api/v3/athlete") {
        return new Response(JSON.stringify({ id: athleteId, bikes: [] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const outcome = await processWebhookEvent({
      id: 4,
      receivedAt: new Date().toISOString(),
      payload: {
        aspect_type: "update",
        event_time: Math.floor(Date.now() / 1000),
        object_id: Number(athleteId),
        object_type: "athlete",
        owner_id: Number(athleteId),
        subscription_id: 1,
        updates: { authorized: "false" },
      },
    });

    expect(outcome).toBe("skipped");
    expect(db.select().from(account).where(eq(account.userId, userId)).get()).toBeDefined();
  });
});

describe("processPendingWebhookEvents", () => {
  it("advances cursor after processing proxy events", async () => {
    const { athleteId } = seedConnectedUser();

    const events: StravaWebhookEnvelope[] = [
      {
        id: 10,
        receivedAt: new Date().toISOString(),
        payload: {
          aspect_type: "create",
          event_time: Math.floor(Date.now() / 1000),
          object_id: 888001,
          object_type: "activity",
          owner_id: Number(athleteId),
          subscription_id: 1,
        },
      },
    ];

    const source: StravaEventSource = {
      async fetchEvents({ afterId }) {
        const filtered = events.filter((event) => event.id > afterId);
        return {
          events: filtered,
          nextAfterId: filtered.length > 0 ? filtered[filtered.length - 1]!.id : null,
        };
      },
    };

    setStravaEventSourceForTests(source);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname === "/api/v3/activities/888001") {
        return mockActivityResponse({
          id: 888001,
          gear_id: "gear-webhook-1",
          distance: 3000,
          moving_time: 1200,
          start_date: new Date().toISOString(),
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    expect(getLastProxyEventId()).toBe(0);

    const result = await processPendingWebhookEvents();
    expect(result.eventsProcessed).toBe(1);
    expect(result.activitiesImported).toBe(1);
    expect(getLastProxyEventId()).toBe(10);
  });

  it("does not advance cursor when event processing fails", async () => {
    const { athleteId } = seedConnectedUser();

    const events: StravaWebhookEnvelope[] = [
      {
        id: 20,
        receivedAt: new Date().toISOString(),
        payload: {
          aspect_type: "create",
          event_time: Math.floor(Date.now() / 1000),
          object_id: 777001,
          object_type: "activity",
          owner_id: Number(athleteId),
          subscription_id: 1,
        },
      },
    ];

    setStravaEventSourceForTests({
      async fetchEvents({ afterId }) {
        const filtered = events.filter((event) => event.id > afterId);
        return {
          events: filtered,
          nextAfterId: filtered.length > 0 ? filtered[filtered.length - 1]!.id : null,
        };
      },
    });

    globalThis.fetch = vi.fn(async () => {
      throw new Error("Strava unavailable");
    });

    const result = await processPendingWebhookEvents();
    expect(result.errors?.[0]).toMatch(/event 20/);
    expect(getLastProxyEventId()).toBe(0);
  });

  it("does not advance cursor when proxy fetch fails", async () => {
    setStravaEventSourceForTests({
      async fetchEvents() {
        throw new Error("proxy down");
      },
    });

    const result = await processPendingWebhookEvents();
    expect(result.errors?.[0]).toMatch(/fetch: proxy down/);
    expect(getLastProxyEventId()).toBe(0);
  });
});

describe("POST /api/strava/sync with proxy", () => {
  it("continues activity sync when proxy fetch fails", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await connectStravaAccount(testUser.email);

    process.env.STRAVA_WEBHOOK_PROXY_URL = "https://proxy.test";
    process.env.STRAVA_WEBHOOK_PROXY_API_KEY = "test-key";
    setStravaEventSourceForTests({
      async fetchEvents() {
        throw new Error("proxy down");
      },
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.hostname === "proxy.test") {
        throw new Error("proxy down");
      }
      if (url.pathname.endsWith("/athlete/activities")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const res = await agent.post("/api/strava/sync").expect(200);
    expect(res.body.webhook?.errors?.[0]).toMatch(/fetch: proxy down/);
    expect(res.body.processedActivities).toBe(0);

    delete process.env.STRAVA_WEBHOOK_PROXY_URL;
    delete process.env.STRAVA_WEBHOOK_PROXY_API_KEY;
    setStravaEventSourceForTests(null);
  });
});
