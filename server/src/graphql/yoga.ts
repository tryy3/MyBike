import { createYoga } from "graphql-yoga";
import { getOperationAST, type DocumentNode } from "graphql";
import { formatError } from "./errors.js";
import { createContext } from "./context.js";
import { schema } from "./schema/index.js";

let yogaSingleton: ReturnType<
  typeof createYoga<Record<string, never>, Awaited<ReturnType<typeof createContext>>>
> | null = null;

function getYoga() {
  if (!yogaSingleton) {
    yogaSingleton = createYoga({
      schema,
      context: createContext,
      maskedErrors: formatError,
      graphqlEndpoint: "/graphql",
    });
  }
  return yogaSingleton;
}

export function createGraphQLYoga() {
  return getYoga();
}

function assertReadOnlyQuery(document: DocumentNode): void {
  const operation = getOperationAST(document);
  if (!operation) {
    throw new Error("Query document must contain a single operation");
  }
  if (operation.operation !== "query") {
    throw new Error("Only read-only GraphQL queries are allowed");
  }
}

export async function executeGraphQLReadOnly(
  query: string,
  variables: Record<string, unknown> | undefined,
  apiKey: string,
) {
  const { parse } = getYoga().getEnveloped({
    request: new Request("http://mybike.internal/graphql"),
  });

  let document: DocumentNode;
  try {
    document = parse(query);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid GraphQL query");
  }

  assertReadOnlyQuery(document);

  const response = await getYoga().fetch(
    new Request("http://mybike.internal/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    }),
  );

  const body = (await response.json()) as {
    data?: unknown;
    errors?: { message: string; path?: readonly (string | number)[] }[];
  };

  if (!response.ok && !body.errors) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }

  return body;
}
