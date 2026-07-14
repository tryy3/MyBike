import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listBikes } from "../../services/bikes.js";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { pickFieldsList } from "../field-selection.js";
import { withRideStatsIfNeeded } from "../serialize.js";
import { assertAllowedFields, BIKE_FIELDS, DEFAULT_BIKE_FIELDS } from "../schema-catalog.js";

export function registerListBikesTool(server: McpServer): void {
  server.registerTool(
    "list_bikes",
    {
      title: "List bikes",
      description: "List the authenticated user's bikes with optional field selection.",
      inputSchema: z.object({
        fields: z.array(z.string()).optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      const userId = requireReadPermission(auth);
      const fields = assertAllowedFields(args.fields, BIKE_FIELDS, "bike");
      const effectiveFields =
        args.fields && args.fields.length > 0 ? fields : [...DEFAULT_BIKE_FIELDS];

      const bikes = await listBikes(userId);
      const serialized = await Promise.all(
        bikes.map((bike) => withRideStatsIfNeeded(userId, bike, effectiveFields)),
      );
      const result = pickFieldsList(serialized, effectiveFields);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { bikes: result },
      };
    },
  );
}
