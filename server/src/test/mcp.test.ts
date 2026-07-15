import { describe, expect, it } from "vite-plus/test";
import request from "supertest";
import { permissionsForScope } from "shared";
import { createApp } from "../app.js";
import { createApiKeyForTestUser, graphqlRequestWithApiKey } from "./api-key-helper.js";
import { createAuthenticatedAgent } from "./auth-helper.js";
import { createBikeViaGraphql, createComponentViaGraphql } from "./graphql-helper.js";

const app = createApp();

const MCP_HEADERS = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
  "MCP-Protocol-Version": "2025-11-25",
};

async function mcpRequest(
  apiKey: string | null,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let req = request(app).post("/mcp").set(MCP_HEADERS);
  if (apiKey) {
    req = req.set("Authorization", `Bearer ${apiKey}`);
  }
  const res = await req.send(body);
  return { status: res.status, body: res.body as Record<string, unknown> };
}

function jsonRpcResult(body: Record<string, unknown>): Record<string, unknown> | undefined {
  return body.result as Record<string, unknown> | undefined;
}

describe("MCP server", () => {
  it("initialize and list tools with valid read API key", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);

    const init = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });

    expect(init.status).toBe(200);
    const initResult = jsonRpcResult(init.body);
    expect(initResult?.serverInfo).toMatchObject({ name: "mybike" });

    const tools = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    expect(tools.status).toBe(200);
    const toolNames = ((jsonRpcResult(tools.body)?.tools as { name: string }[]) ?? []).map(
      (tool) => tool.name,
    );
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "describe_data_model",
        "list_bikes",
        "find_bike",
        "get_bike",
        "list_component_categories",
        "get_bike_components",
        "graphql_query",
      ]),
    );
  });

  it("rejects missing and invalid API keys", async () => {
    const missing = await mcpRequest(null, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(missing.status).toBe(401);

    const invalid = await mcpRequest("mbk_invalid", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(invalid.status).toBe(401);
  });

  it("list_bikes returns user bikes and respects fields", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);
    const bike = await createBikeViaGraphql(agent, "MCP Bike A");

    const full = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_bikes",
        arguments: {},
      },
    });

    expect(full.status).toBe(200);
    const structured = jsonRpcResult(full.body)?.structuredContent as {
      bikes: { id: string; name: string }[];
    };
    expect(
      structured.bikes.some((entry) => entry.id === bike.id && entry.name === "MCP Bike A"),
    ).toBe(true);

    const trimmed = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "list_bikes",
        arguments: { fields: ["id", "name"] },
      },
    });

    const trimmedBike = (
      (jsonRpcResult(trimmed.body)?.structuredContent as { bikes: Record<string, unknown>[] })
        ?.bikes ?? []
    ).find((entry) => entry.id === bike.id);
    expect(trimmedBike).toEqual({ id: bike.id, name: "MCP Bike A" });
  });

  it("find_bike matches name substring", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);
    const bike = await createBikeViaGraphql(agent, "City Hybrid");

    const res = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: { name: "find_bike", arguments: { nameContains: "hybrid" } },
    });

    expect(res.status).toBe(200);
    const bikes = (
      jsonRpcResult(res.body)?.structuredContent as { bikes: { id: string; name: string }[] }
    )?.bikes;
    expect(bikes?.some((b) => b.id === bike.id && b.name === "City Hybrid")).toBe(true);

    const none = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: { name: "find_bike", arguments: { nameContains: "no-such-bike-zzz" } },
    });
    const empty = (jsonRpcResult(none.body)?.structuredContent as { bikes: unknown[] })?.bikes;
    expect(empty).toEqual([]);
  });

  it("list_maintenance_tasks returns seeded EOL tasks", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);
    const bike = await createBikeViaGraphql(agent, "Maint Bike");

    const res = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/call",
      params: {
        name: "list_maintenance_tasks",
        arguments: { bikeId: bike.id, kind: "eol", category: "cassette" },
      },
    });

    expect(res.status).toBe(200);
    const tasks = (
      jsonRpcResult(res.body)?.structuredContent as {
        tasks: { kind: string; componentCategory: string | null; templateKey: string | null }[];
      }
    )?.tasks;
    expect(tasks?.length).toBeGreaterThanOrEqual(1);
    expect(tasks!.every((t) => t.kind === "eol" && t.componentCategory === "cassette")).toBe(true);
  });

  it("create_component requires write scope and creates inactive when sibling exists", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);
    const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
    const bike = await createBikeViaGraphql(agent, "Create Comp Bike");
    await createComponentViaGraphql(agent, bike.id, {
      category: "cassette",
      name: "Old Cassette",
      brand: "Shimano",
      model: "CS-Old",
      isActive: true,
    });

    const denied = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: {
        name: "create_component",
        arguments: {
          bikeId: bike.id,
          category: "cassette",
          name: "New Cassette",
          brand: "SRAM",
          model: "XG-1270",
        },
      },
    });
    expect(jsonRpcResult(denied.body)?.isError).toBe(true);

    const ok = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: {
        name: "create_component",
        arguments: {
          bikeId: bike.id,
          category: "cassette",
          name: "New Cassette",
          brand: "SRAM",
          model: "XG-1270",
        },
      },
    });
    expect(ok.status).toBe(200);
    const component = (
      jsonRpcResult(ok.body)?.structuredContent as {
        component: { isActive: boolean; model: string };
      }
    )?.component;
    expect(component?.model).toBe("XG-1270");
    expect(component?.isActive).toBe(false);
  });

  it("update_component updates brand/model and rejects name", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
    const bike = await createBikeViaGraphql(agent, "Update Comp Bike");
    const created = await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Keep This Name",
      brand: "OldBrand",
      model: "OldModel",
      isActive: true,
    });

    const ok = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 40,
      method: "tools/call",
      params: {
        name: "update_component",
        arguments: { componentId: created.id, brand: "NewBrand", model: "NewModel" },
      },
    });
    const component = (
      jsonRpcResult(ok.body)?.structuredContent as {
        component: { name: string; brand: string; model: string };
      }
    )?.component;
    expect(component).toMatchObject({
      name: "Keep This Name",
      brand: "NewBrand",
      model: "NewModel",
    });

    const rejected = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 41,
      method: "tools/call",
      params: {
        name: "update_component",
        arguments: { componentId: created.id, name: "Hacked" },
      },
    });
    expect(jsonRpcResult(rejected.body)?.isError).toBe(true);
  });

  it("set_active_component rotates active chain", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
    const bike = await createBikeViaGraphql(agent, "Swap Chain Bike");
    const a = await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Chain A",
      brand: "KMC",
      model: "A",
      isActive: true,
    });
    const b = await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Chain B",
      brand: "KMC",
      model: "B",
      isActive: false,
    });

    const res = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "set_active_component", arguments: { componentId: b.id } },
    });
    const component = (
      jsonRpcResult(res.body)?.structuredContent as { component: { id: string; isActive: boolean } }
    )?.component;
    expect(component).toMatchObject({ id: b.id, isActive: true });

    // verify via get_bike_components activeOnly
    const list = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: {
        name: "get_bike_components",
        arguments: { bikeId: bike.id, activeOnly: true, filter: { categories: ["chain"] } },
      },
    });
    const active = (jsonRpcResult(list.body)?.structuredContent as { components: { id: string }[] })
      ?.components;
    expect(active?.map((c) => c.id)).toEqual([b.id]);
    expect(a.id).not.toBe(b.id);
  });

  it("replace_component logs EOL replace and activates new cassette", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const writeKey = await createApiKeyForTestUser(testUser, permissionsForScope("write"));
    const bike = await createBikeViaGraphql(agent, "EOL Replace Bike");
    await createComponentViaGraphql(agent, bike.id, {
      category: "cassette",
      name: "Worn Cassette",
      brand: "Shimano",
      model: "Old",
      isActive: true,
    });

    const created = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 60,
      method: "tools/call",
      params: {
        name: "create_component",
        arguments: {
          bikeId: bike.id,
          category: "cassette",
          name: "Fresh Cassette",
          brand: "SRAM",
          model: "XXXX",
        },
      },
    });
    const newId = (jsonRpcResult(created.body)?.structuredContent as { component: { id: string } })
      ?.component.id;

    const replaced = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: {
        name: "replace_component",
        arguments: {
          bikeId: bike.id,
          category: "cassette",
          newComponentId: newId,
          resetWear: true,
        },
      },
    });
    expect(replaced.status).toBe(200);
    const record = (
      jsonRpcResult(replaced.body)?.structuredContent as {
        serviceRecord: { action: string; componentId: string | null };
      }
    )?.serviceRecord;
    expect(record?.action).toBe("replaced");

    const list = await mcpRequest(writeKey, {
      jsonrpc: "2.0",
      id: 62,
      method: "tools/call",
      params: {
        name: "get_bike_components",
        arguments: { bikeId: bike.id, activeOnly: true, filter: { categories: ["cassette"] } },
      },
    });
    const active = (jsonRpcResult(list.body)?.structuredContent as { components: { id: string }[] })
      ?.components;
    expect(active?.[0]?.id).toBe(newId);
  });

  it("replace_component denies read-only API keys", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);

    const denied = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 63,
      method: "tools/call",
      params: {
        name: "replace_component",
        arguments: {
          taskId: "00000000-0000-4000-8000-000000000001",
          newComponentId: "00000000-0000-4000-8000-000000000002",
        },
      },
    });

    expect(jsonRpcResult(denied.body)?.isError).toBe(true);
  });

  it("list_component_categories returns all categories", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);

    const res = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "list_component_categories",
        arguments: {},
      },
    });

    expect(res.status).toBe(200);
    const categories = (
      jsonRpcResult(res.body)?.structuredContent as { categories: { id: string }[] } | undefined
    )?.categories;
    expect(categories).toBeDefined();
    expect(categories!.length).toBe(26);
    expect(categories!.some((category) => category.id === "chain")).toBe(true);
  });

  it("get_bike_components filters active chain components", async () => {
    const { agent, user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);
    const bike = await createBikeViaGraphql(agent, "MCP Components Bike");
    await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Active Chain",
      brand: "Shimano",
      model: "CN-HG71",
      isActive: true,
    });
    await createComponentViaGraphql(agent, bike.id, {
      category: "chain",
      name: "Old Chain",
      brand: "Shimano",
      model: "CN-Old",
      isActive: false,
    });

    const res = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "get_bike_components",
        arguments: {
          bikeId: bike.id,
          activeOnly: true,
          filter: { categories: ["chain"] },
        },
      },
    });

    expect(res.status).toBe(200);
    const components = (
      jsonRpcResult(res.body)?.structuredContent as { components: { name: string }[] } | undefined
    )?.components;
    expect(components).toHaveLength(1);
    expect(components![0]?.name).toBe("Active Chain");
  });

  it("graphql_query allows reads and rejects mutations", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);

    const query = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "graphql_query",
        arguments: { query: "{ bikes { id name } }" },
      },
    });

    expect(query.status).toBe(200);
    const data = (
      jsonRpcResult(query.body)?.structuredContent as { data: { bikes: unknown[] } } | undefined
    )?.data;
    expect(data).toBeDefined();
    expect(Array.isArray(data!.bikes)).toBe(true);

    const mutation = await mcpRequest(readKey, {
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "graphql_query",
        arguments: {
          query: 'mutation { createBike(input: { name: "Nope" }) { id } }',
        },
      },
    });

    expect(mutation.status).toBe(200);
    expect(jsonRpcResult(mutation.body)?.isError).toBe(true);
  });

  it("isolates bikes between users for MCP get_bike", async () => {
    const { agent: agentA } = await createAuthenticatedAgent(app);
    const { user: userB } = await createAuthenticatedAgent(app);
    const bikeA = await createBikeViaGraphql(agentA, "User A Only");
    const apiKeyB = await createApiKeyForTestUser(userB);

    const res = await mcpRequest(apiKeyB, {
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "get_bike",
        arguments: { bikeId: bikeA.id },
      },
    });

    expect(res.status).toBe(200);
    expect(jsonRpcResult(res.body)?.isError).toBe(true);
  });

  it("accepts x-api-key header", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);

    const res = await request(app).post("/mcp").set(MCP_HEADERS).set("x-api-key", readKey).send({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/list",
      params: {},
    });

    expect(res.status).toBe(200);
  });

  it("graphql API key still works on GraphQL but not REST", async () => {
    const { user: testUser } = await createAuthenticatedAgent(app);
    const readKey = await createApiKeyForTestUser(testUser);

    const gql = await graphqlRequestWithApiKey(app, readKey, "{ bikes { id } }");
    expect(gql.body.errors).toBeUndefined();

    const rest = await request(app)
      .get("/api/strava/status")
      .set("Authorization", `Bearer ${readKey}`);
    expect(rest.status).toBe(401);
  });
});
