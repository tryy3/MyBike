import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { executeGraphQLReadOnly } from "../../graphql/yoga.js";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { stripTypenames } from "../field-selection.js";
import { withMcpToolLog } from "../tool-log.js";

export function registerGraphqlQueryTool(server: McpServer): void {
  server.registerTool(
    "graphql_query",
    {
      title: "GraphQL query",
      description:
        "Run a read-only GraphQL query against MyBike when typed tools are not enough. Mutations and subscriptions are rejected.",
      inputSchema: z.object({
        query: z.string().min(1),
        variables: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("graphql_query", auth, args, async () => {
        requireReadPermission(auth);

        const result = await executeGraphQLReadOnly(args.query, args.variables, auth.token);

        const payload = {
          data: stripTypenames(result.data),
          errors: result.errors?.map((error) => ({
            message: error.message,
            path: error.path,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      });
    },
  );
}
