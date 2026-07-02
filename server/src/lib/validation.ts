import type { Request } from "express";
import { ZodError, type ZodType } from "zod";
import { badRequest } from "./errors.js";

export function parseBody<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ZodError(result.error.issues);
  }
  return result.data;
}

export function parseParams(req: Request, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = req.params[k];
    if (v === undefined) {
      throw badRequest(`Missing path parameter: ${k}`);
    }
    if (Array.isArray(v)) {
      if (v.length !== 1) {
        throw badRequest(`Expected single value for path parameter: ${k}`);
      }
      out[k] = v[0];
    } else {
      out[k] = v;
    }
  }
  return out;
}
