import request from "supertest";
import { describe, expect, it } from "vite-plus/test";
import { createApp } from "../app.js";

const app = createApp();

const sampleEvent = {
  aspect_type: "create",
  event_time: 1516126040,
  object_id: 1360128428,
  object_type: "activity",
  owner_id: 134815,
  subscription_id: 120475,
};

describe("GET /webhook/strava", () => {
  it("returns hub.challenge when verify token matches", async () => {
    const res = await request(app)
      .get("/webhook/strava")
      .query({
        "hub.mode": "subscribe",
        "hub.challenge": "abc123",
        "hub.verify_token": "test-verify-token",
      })
      .expect(200);

    expect(res.body).toEqual({ "hub.challenge": "abc123" });
  });

  it("returns 403 when verify token does not match", async () => {
    await request(app)
      .get("/webhook/strava")
      .query({
        "hub.mode": "subscribe",
        "hub.challenge": "abc123",
        "hub.verify_token": "wrong-token",
      })
      .expect(403);
  });
});

describe("POST /webhook/strava + GET /api/events", () => {
  it("stores webhook and returns it via authenticated pull API", async () => {
    await request(app).post("/webhook/strava").send(sampleEvent).expect(200);

    const unauthorized = await request(app).get("/api/events").expect(401);
    expect(unauthorized.body.error).toBe("Unauthorized");

    const res = await request(app)
      .get("/api/events")
      .set("Authorization", "Bearer test-proxy-api-key")
      .expect(200);

    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].payload).toMatchObject(sampleEvent);
    expect(res.body.nextAfterId).toBe(res.body.events[0].id);
  });

  it("paginates with after_id cursor", async () => {
    await request(app)
      .post("/webhook/strava")
      .send({ ...sampleEvent, object_id: 2001 })
      .expect(200);
    await request(app)
      .post("/webhook/strava")
      .send({ ...sampleEvent, object_id: 2002 })
      .expect(200);

    const first = await request(app)
      .get("/api/events")
      .query({ after_id: 0, limit: 1 })
      .set("Authorization", "Bearer test-proxy-api-key")
      .expect(200);

    expect(first.body.events).toHaveLength(1);

    const second = await request(app)
      .get("/api/events")
      .query({ after_id: first.body.nextAfterId, limit: 10 })
      .set("Authorization", "Bearer test-proxy-api-key")
      .expect(200);

    expect(second.body.events.length).toBeGreaterThanOrEqual(1);
    for (const event of second.body.events) {
      expect(event.id).toBeGreaterThan(first.body.nextAfterId);
    }
  });

  it("filters events by owner_id and since", async () => {
    await request(app)
      .post("/webhook/strava")
      .send({ ...sampleEvent, owner_id: 111, event_time: 1000, object_id: 3001 })
      .expect(200);
    await request(app)
      .post("/webhook/strava")
      .send({ ...sampleEvent, owner_id: 222, event_time: 2000, object_id: 3002 })
      .expect(200);

    const byOwner = await request(app)
      .get("/api/events")
      .query({ after_id: 0, owner_id: 222 })
      .set("Authorization", "Bearer test-proxy-api-key")
      .expect(200);

    expect(
      byOwner.body.events.every(
        (e: { payload: { owner_id: number } }) => e.payload.owner_id === 222,
      ),
    ).toBe(true);

    const bySince = await request(app)
      .get("/api/events")
      .query({ after_id: 0, since: 1500 })
      .set("Authorization", "Bearer test-proxy-api-key")
      .expect(200);

    expect(
      bySince.body.events.every(
        (e: { payload: { event_time: number } }) => e.payload.event_time >= 1500,
      ),
    ).toBe(true);
  });
});

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
  });
});
