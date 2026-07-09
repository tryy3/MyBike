import type { Request, Response, NextFunction } from "express";
import { auth, type SessionUser } from "./auth.js";
import { HttpError } from "./errors.js";

export interface AuthenticatedRequest extends Request {
  user: SessionUser;
  userId: string;
}

function toHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: toHeaders(req) });
    if (!session?.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const authed = req as AuthenticatedRequest;
    authed.user = session.user;
    authed.userId = session.user.id;
    req.log = req.log.child({ userId: session.user.id });
    next();
  } catch (err) {
    req.log.error({ err }, "Session lookup failed");
    next(err);
  }
}

export function unauthorized(message = "Unauthorized"): HttpError {
  return new HttpError(401, message);
}

export function getAuthContext(req: Request): {
  user: SessionUser;
  userId: string;
} {
  const { user, userId } = req as unknown as AuthenticatedRequest;
  return { user, userId };
}
