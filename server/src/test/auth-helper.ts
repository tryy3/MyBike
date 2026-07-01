import type { Express } from "express";
import request from "supertest";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export async function createAuthenticatedAgent(
  app: Express,
  overrides?: Partial<TestUser>,
) {
  const user: TestUser = {
    name: overrides?.name ?? "Test User",
    email: overrides?.email ?? `user-${crypto.randomUUID()}@example.com`,
    password: overrides?.password ?? "password12345",
  };

  const agent = request.agent(app);
  await agent
    .post("/api/auth/sign-up/email")
    .send(user)
    .expect(200);

  return { agent, user };
}
