import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { getSchemaCatalog } from "../schema-catalog.js";
import { withMcpToolLog } from "../tool-log.js";

export function registerDescribeDataModelTool(server: McpServer): void {
  server.registerTool(
    "describe_data_model",
    {
      title: "Describe MyBike data model",
      description:
        "Returns available bike/component fields, component categories, and filter options before querying data.",
      inputSchema: z.object({}),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("describe_data_model", auth, args, async () => {
        requireReadPermission(auth);
        const catalog = getSchemaCatalog();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(catalog, null, 2) }],
          structuredContent: catalog,
        };
      });
    },
  );
}
