import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listComponentsForBike } from "../../services/bikes.js";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { mergeMcpComponentFilter, parseComponentFilterInput } from "../filter-utils.js";
import { pickFieldsList } from "../field-selection.js";
import {
  assertAllowedFields,
  COMPONENT_FIELDS,
  DEFAULT_COMPONENT_FIELDS,
} from "../schema-catalog.js";
import { serializeComponent } from "../serialize.js";

const componentFilterSchema = z
  .object({
    categories: z.array(z.string()).optional(),
    activeOnly: z.boolean().optional(),
    isActive: z.boolean().optional(),
    brands: z.array(z.string()).optional(),
    nameContains: z.string().optional(),
    brandContains: z.string().optional(),
    modelContains: z.string().optional(),
  })
  .optional();

export function registerGetBikeComponentsTool(server: McpServer): void {
  server.registerTool(
    "get_bike_components",
    {
      title: "Get bike components",
      description: "Fetch components for a bike with optional filters and field selection.",
      inputSchema: z.object({
        bikeId: z.string().min(1),
        fields: z.array(z.string()).optional(),
        filter: componentFilterSchema,
        activeOnly: z.boolean().optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      const userId = requireReadPermission(auth);
      const fields = assertAllowedFields(args.fields, COMPONENT_FIELDS, "component");
      const effectiveFields =
        args.fields && args.fields.length > 0 ? fields : [...DEFAULT_COMPONENT_FIELDS];

      const parsedFilter = args.filter ? parseComponentFilterInput(args.filter) : undefined;
      const mergedFilter = mergeMcpComponentFilter(args.activeOnly ?? false, parsedFilter);
      const components = listComponentsForBike(args.bikeId, userId, { filter: mergedFilter }).map(
        serializeComponent,
      );
      const result = pickFieldsList(components, effectiveFields);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { bikeId: args.bikeId, components: result },
      };
    },
  );
}
