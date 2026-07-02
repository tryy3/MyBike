import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { db } from "../db/index";
import { account, session, user, verification } from "../db/auth-schema";
import { resolveAuthConfig } from "./auth-config";

const { secret, baseURL, clientURL } = resolveAuthConfig();

export const auth = betterAuth({
  secret,
  baseURL,
  basePath: "/api/auth",
  trustedOrigins: [clientURL],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type SessionUser = typeof auth.$Infer.Session.user;
