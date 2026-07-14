import type { Express } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import { permissionsForScope } from "shared";
import { auth } from "../lib/auth.js";
import { user } from "../db/auth-schema.js";
import { db } from "../db/index.js";
import { graphqlRequest } from "./graphql-helper.js";
import type { TestUser } from "./auth-helper.js";

export async function userIdForEmail(email: string): Promise<string> {
  const row = await db.select().from(user).where(eq(user.email, email)).get();
  if (!row) {
    throw new Error(`User not found for email: ${email}`);
  }
  return row.id;
}

export async function createApiKeyForUser(
  userId: string,
  permissions: Record<string, string[]> = permissionsForScope("read"),
  name = "Test API key",
): Promise<string> {
  const result = await auth.api.createApiKey({
    body: {
      configId: "graphql",
      name,
      userId,
      permissions,
    },
  });

  if (!result.key) {
    throw new Error("Failed to create API key");
  }

  return result.key;
}

export async function graphqlRequestWithApiKey<T = unknown>(
  app: Express,
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{
  status: number;
  body: { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
}> {
  const res = await request(app)
    .post("/graphql")
    .set("Authorization", `Bearer ${apiKey}`)
    .set("Content-Type", "application/json")
    .send({ query, variables });

  return { status: res.status, body: res.body };
}

export async function createApiKeyForTestUser(
  testUser: TestUser,
  permissions: Record<string, string[]> = permissionsForScope("read"),
): Promise<string> {
  const userId = await userIdForEmail(testUser.email);
  return createApiKeyForUser(userId, permissions);
}

export { graphqlRequest };
