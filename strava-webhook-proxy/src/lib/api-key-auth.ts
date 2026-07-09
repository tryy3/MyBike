import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export { safeEqual };

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env.STRAVA_WEBHOOK_PROXY_API_KEY;
  if (!configured) {
    req.log.warn("API key not configured");
    res.status(503).json({ error: "API key not configured" });
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token || !safeEqual(token, configured)) {
    req.log.warn("Unauthorized API key");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
