import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { genericOAuth } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { db } from "../db/index.js";
import { account, session, user, verification } from "../db/auth-schema.js";
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
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path;
      const newSession = ctx.context.newSession;

      if (newSession?.user?.id) {
        if (path === "/sign-up/email") {
          log.info({ userId: newSession.user.id, event: "sign-up" }, "User authenticated");
        } else if (path === "/sign-in/email") {
          log.info({ userId: newSession.user.id, event: "sign-in" }, "User authenticated");
        } else if (path.startsWith("/callback/")) {
          const provider = path.split("/").pop() ?? "unknown";
          log.info(
            { userId: newSession.user.id, provider, event: "oauth-sign-in" },
            "User authenticated",
          );
        }
      }

      if (path === "/sign-out") {
        const userId = ctx.context.session?.user?.id;
        if (userId) {
          log.info({ userId, event: "sign-out" }, "User signed out");
        }
      }
    }),
  },
  onAPIError: {
    onError: (error) => {
      log.warn({ err: error }, "Auth API error");
    },
  },
});

export const stravaLoginEnabled = isStravaOAuthConfigured();

export type SessionUser = typeof auth.$Infer.Session.user;
