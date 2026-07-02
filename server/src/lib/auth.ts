import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index";
import * as authSchema from "../db/auth-schema";
import { resolveAuthConfig } from "./auth-config";

const { secret, baseURL, clientURL } = resolveAuthConfig();

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
