import { describe, expect, it } from "vite-plus/test";
import request from "supertest";
import { permissionsForScope } from "shared";
import { createApp } from "../app.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import {
  createApiKeyForTestUser,
  createApiKeyForUser,
  graphqlRequestWithApiKey,
  userIdForEmail,
} from "./api-key-helper.js";
import { createBikeViaGraphql, graphqlRequest } from "./graphql-helper.js";

const app = createApp();

describe("GraphQL API key authentication", () => {
  it("allows read-only keys to query bikes", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    await createBikeViaGraphql(agent, "API Bike");

    const apiKey = await createApiKeyForTestUser(testUser);
    const res = await graphqlRequestWithApiKey<{ bikes: { name: string }[] }>(
      app,
      apiKey,
      "{ bikes { name } }",
    );

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data?.bikes).toEqual([{ name: "API Bike" }]);
  });

  it("rejects read-only keys for createBike mutations", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const apiKey = await createApiKeyForTestUser(testUser);

    const res = await graphqlRequestWithApiKey(
      app,
      apiKey,
      `mutation($input: BikeInsertInput!) {
        createBike(input: $input) { id }
      }`,
      { input: { name: "Blocked Bike" } },
    );

    expect(res.body.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("rejects invalid API keys", async () => {
    const res = await graphqlRequestWithApiKey(app, "mbk_invalid_key", "{ bikes { id } }");
    expect(res.body.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  it("does not authenticate REST routes with API keys", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const apiKey = await createApiKeyForTestUser(testUser);

    const res = await request(app)
      .get("/api/strava/status")
      .set("Authorization", `Bearer ${apiKey}`)
      .expect(401);

    expect(res.body.error).toBe("Unauthorized");
  });

  it("keeps session cookie GraphQL working", async () => {
    const { agent } = await createAuthenticatedAgent(app);
    const bike = await createBikeViaGraphql(agent, "Session Bike");

    const res = await graphqlRequest<{ bikes: { id: string }[] }>(agent, "{ bikes { id } }");
    expect(res.body.data?.bikes).toEqual([{ id: bike.id }]);
  });

  it("isolates bikes between users for API keys", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { user: userB } = await createAuthenticatedAgent(app);

    const bike = await createBikeViaGraphql(agentA, "User A Only");
    const apiKeyB = await createApiKeyForTestUser(userB);

    const foreign = await graphqlRequestWithApiKey(
      app,
      apiKeyB,
      `query($id: ID!) { bike(id: $id) { id } }`,
      { id: bike.id },
    );
    expect(foreign.body.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");

    const list = await graphqlRequestWithApiKey<{ bikes: { id: string }[] }>(
      app,
      apiKeyB,
      "{ bikes { id } }",
    );
    expect(list.body.data?.bikes).toEqual([]);
  });

  it("allows write keys to create bikes", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const userId = await userIdForEmail(testUser.email);
    const apiKey = await createApiKeyForUser(userId, permissionsForScope("write"));

    const res = await graphqlRequestWithApiKey<{ createBike: { name: string } }>(
      app,
      apiKey,
      `mutation($input: BikeInsertInput!) {
        createBike(input: $input) { name }
      }`,
      { input: { name: "Write Key Bike" } },
    );

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data?.createBike.name).toBe("Write Key Bike");
  });
});
