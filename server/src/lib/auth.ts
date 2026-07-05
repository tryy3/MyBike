import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { genericOAuth } from "better-auth/plugins";
import { db } from "../db/index.js";
import { account, session, user, verification } from "../db/auth-schema.js";
import { resolveAuthConfig } from "./auth-config.js";
import { buildStravaOAuthConfig, isStravaOAuthConfigured } from "./strava-oauth.js";

const { secret, baseURL, clientURL } = resolveAuthConfig();

const stravaOAuthPlugins = isStravaOAuthConfigured()
  ? [genericOAuth({ config: [buildStravaOAuthConfig()] })]
  : [];

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
  plugins: stravaOAuthPlugins,
});

export const stravaLoginEnabled = isStravaOAuthConfigured();

export type SessionUser = typeof auth.$Infer.Session.user;
