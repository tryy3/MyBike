import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listBikes } from "../../services/bikes.js";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { pickFieldsList } from "../field-selection.js";
import { assertAllowedFields, BIKE_FIELDS, DEFAULT_BIKE_FIELDS } from "../schema-catalog.js";
import { withRideStatsIfNeeded } from "../serialize.js";
import { withMcpToolLog } from "../tool-log.js";

function includesCI(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function registerFindBikeTool(server: McpServer): void {
  server.registerTool(
    "find_bike",
    {
      title: "Find bike",
      description:
        "Find bikes by case-insensitive name substring (optional brand/model). Returns matches; empty if none. Use list_bikes if you need the full garage.",
      inputSchema: z.object({
        nameContains: z.string().trim().min(1),
        brandContains: z.string().trim().min(1).optional(),
        modelContains: z.string().trim().min(1).optional(),
        fields: z.array(z.string()).optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("find_bike", auth, args, async () => {
        const userId = requireReadPermission(auth);
        const fields = assertAllowedFields(args.fields, BIKE_FIELDS, "bike");
        const effectiveFields =
          args.fields && args.fields.length > 0 ? fields : [...DEFAULT_BIKE_FIELDS];

        const bikes = (await listBikes(userId)).filter((bike) => {
          if (!includesCI(bike.name, args.nameContains)) return false;
          if (args.brandContains && !includesCI(bike.brand, args.brandContains)) return false;
          if (args.modelContains && !includesCI(bike.model, args.modelContains)) return false;
          return true;
        });

        const serialized = await Promise.all(
          bikes.map((bike) => withRideStatsIfNeeded(userId, bike, effectiveFields)),
        );
        const result = pickFieldsList(serialized, effectiveFields);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: { bikes: result },
        };
      });
    },
  );
}
