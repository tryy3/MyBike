import { type RequestDocument, type Variables } from "graphql-request";
import { ApiError } from "./api.js";

function graphqlEndpoint(): string {
  if (typeof window !== "undefined") {
    return new URL("/graphql", window.location.origin).href;
  }
  return "/graphql";
}

interface GraphQLErrorBody {
  message: string;
  extensions?: {
    code?: string;
    details?: unknown;
    http?: { status?: number };
  };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorBody[];
}

export async function graphqlFetch<T, V extends Variables = Variables>(
  document: RequestDocument,
  variables?: V,
): Promise<T> {
  const body = await graphqlFetchRaw<T, V>(document, variables);
  return body.data as T;
}

export async function graphqlFetchRaw<T, V extends Variables = Variables>(
  document: RequestDocument,
  variables?: V,
): Promise<GraphQLResponse<T>> {
  const res = await fetch(graphqlEndpoint(), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: document, variables }),
  });

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    const first = body.errors[0]!;
    const status = first.extensions?.http?.status ?? res.status ?? 400;
    throw new ApiError(status, first.message, first.extensions?.details);
  }
  if (!body.data) {
    throw new ApiError(res.status, "GraphQL response missing data");
  }
  return body;
}
