import { Router } from "express";
import { resolveOAuthProviderFlags } from "../lib/oauth-providers.js";

export const oauthProvidersRouter = Router();

oauthProvidersRouter.get("/config", (_req, res) => {
  res.json({ providers: resolveOAuthProviderFlags() });
});

export default oauthProvidersRouter;
