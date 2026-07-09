import { createYoga } from "graphql-yoga";
import type { GraphQLContext } from "./context.js";
import { createContext } from "./context.js";
import { formatError } from "./errors.js";
import { schema } from "./schema/index.js";

export function createGraphQLYoga() {
  return createYoga<Record<string, never>, GraphQLContext>({
    schema,
    context: createContext,
    maskedErrors: formatError,
    graphqlEndpoint: "/graphql",
  });
}
