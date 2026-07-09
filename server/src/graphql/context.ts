import type { YogaInitialContext } from "graphql-yoga";
import { auth } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";

export interface GraphQLContext {
  userId: string | null;
}

function toHeaders(request: Request): Headers {
  return request.headers;
}

export async function createContext(initialContext: YogaInitialContext): Promise<GraphQLContext> {
  const session = await auth.api.getSession({ headers: toHeaders(initialContext.request) });
  return { userId: session?.user?.id ?? null };
}

export function requireUserId(context: GraphQLContext): string {
  if (!context.userId) {
    throw new HttpError(401, "Unauthorized");
  }
  return context.userId;
}
