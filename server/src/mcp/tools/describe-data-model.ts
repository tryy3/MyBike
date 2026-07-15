import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getSchemaCatalog } from "../schema-catalog.js";

export function registerDescribeDataModelTool(server: McpServer): void {
  server.registerTool(
    "describe_data_model",
    {
      title: "Describe MyBike data model",
      description:
        "Returns available bike/component fields, component categories, and filter options before querying data.",
      inputSchema: z.object({}),
    },
    async () => {
      const catalog = getSchemaCatalog();
      return {
        content: [{ type: "text", text: JSON.stringify(catalog, null, 2) }],
        structuredContent: catalog,
      };
    },
  );
}
