import { McpServer } from "@modelcontextprotocol/server";
import { getSchemaCatalog } from "./schema-catalog.js";
import { registerDescribeDataModelTool } from "./tools/describe-data-model.js";
import { registerFindBikeTool } from "./tools/find-bike.js";
import { registerGetBikeTool } from "./tools/get-bike.js";
import { registerGetBikeComponentsTool } from "./tools/get-bike-components.js";
import { registerGraphqlQueryTool } from "./tools/graphql-query.js";
import { registerListBikesTool } from "./tools/list-bikes.js";
import { registerListComponentCategoriesTool } from "./tools/list-component-categories.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mybike",
    version: "1.0.0",
  });

  server.registerResource(
    "schema",
    "mybike://schema",
    {
      title: "MyBike data model",
      description: "Reference catalog of bike/component fields, categories, and filters.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "mybike://schema",
          mimeType: "application/json",
          text: JSON.stringify(getSchemaCatalog(), null, 2),
        },
      ],
    }),
  );

  registerDescribeDataModelTool(server);
  registerListBikesTool(server);
  registerFindBikeTool(server);
  registerGetBikeTool(server);
  registerListComponentCategoriesTool(server);
  registerGetBikeComponentsTool(server);
  registerGraphqlQueryTool(server);

  return server;
}
