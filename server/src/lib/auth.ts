import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as authSchema from "../db/auth-schema.js";

const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me-in-production-32chars";
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
const clientURL = process.env.CLIENT_URL ?? "http://localhost:5173";

export const auth = betterAuth({
  secret,
  baseURL,
  basePath: "/api/auth",
  trustedOrigins: [clientURL],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type SessionUser = typeof auth.$Infer.Session.user;
