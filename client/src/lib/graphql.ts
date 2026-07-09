import { GraphQLClient, type RequestDocument, type Variables } from "graphql-request";
import { ApiError } from "./api.js";

const endpoint = "/graphql";

const client = new GraphQLClient(endpoint, {
  credentials: "include",
  headers: { "content-type": "application/json" },
});

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
  try {
    const result = (await client.request(document, variables)) as T;
    return result;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "response" in error) {
      const response = (error as { response?: { errors?: GraphQLErrorBody[]; status?: number } })
        .response;
      const first = response?.errors?.[0];
      const status = first?.extensions?.http?.status ?? response?.status ?? 500;
      throw new ApiError(
        status,
        first?.message ?? "GraphQL request failed",
        first?.extensions?.details,
      );
    }
    throw error;
  }
}

export async function graphqlFetchRaw<T, V extends Variables = Variables>(
  document: RequestDocument,
  variables?: V,
): Promise<GraphQLResponse<T>> {
  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: document, variables }),
  });

  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors?.length) {
    const first = body.errors[0]!;
    const status = first.extensions?.http?.status ?? 400;
    throw new ApiError(status, first.message, first.extensions?.details);
  }
  if (!body.data) {
    throw new ApiError(res.status, "GraphQL response missing data");
  }
  return body;
}
