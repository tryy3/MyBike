import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { genericOAuth } from "better-auth/plugins";
import { db } from "../db/index.js";
import { account, session, user, verification } from "../db/auth-schema.js";
import { resolveAuthMethod } from "./auth-events.js";
import { resolveAuthConfig } from "./auth-config.js";
import { child } from "./logging/index.js";
import { buildStravaOAuthConfig, isStravaOAuthConfigured } from "./strava-oauth.js";

const log = child({ component: "auth" });

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
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          log.info({ userId: createdUser.id, event: "sign-up" }, "User registered");
        },
      },
    },
    session: {
      create: {
        after: async (createdSession, ctx) => {
          log.info(
            {
              userId: createdSession.userId,
              event: "sign-in",
              method: resolveAuthMethod(ctx),
            },
            "User signed in",
          );
        },
      },
      delete: {
        after: async (deletedSession, ctx) => {
          if (ctx?.path !== "/sign-out") {
            return;
          }
          log.info({ userId: deletedSession.userId, event: "sign-out" }, "User signed out");
        },
      },
    },
  },
  onAPIError: {
    onError: (error) => {
      log.warn({ err: error }, "Auth API error");
    },
  },
});

export const stravaLoginEnabled = isStravaOAuthConfigured();

export type SessionUser = typeof auth.$Infer.Session.user;
