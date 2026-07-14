import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listComponentsForBike, requireBike } from "../../services/bikes.js";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { mergeMcpComponentFilter, parseComponentFilterInput } from "../filter-utils.js";
import { pickFields, pickFieldsList } from "../field-selection.js";
import {
  assertAllowedFields,
  BIKE_FIELDS,
  COMPONENT_FIELDS,
  DEFAULT_BIKE_FIELDS,
  DEFAULT_COMPONENT_FIELDS,
} from "../schema-catalog.js";
import { serializeComponent, withRideStatsIfNeeded } from "../serialize.js";

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

export function registerGetBikeTool(server: McpServer): void {
  server.registerTool(
    "get_bike",
    {
      title: "Get bike",
      description: "Fetch one bike by id with optional field selection and optional components.",
      inputSchema: z.object({
        bikeId: z.string().min(1),
        fields: z.array(z.string()).optional(),
        includeComponents: z.boolean().optional(),
        componentFields: z.array(z.string()).optional(),
        componentFilter: componentFilterSchema,
        activeOnly: z.boolean().optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      const userId = requireReadPermission(auth);
      const bikeFields = assertAllowedFields(args.fields, BIKE_FIELDS, "bike");
      const effectiveBikeFields =
        args.fields && args.fields.length > 0 ? bikeFields : [...DEFAULT_BIKE_FIELDS];

      const bike = await requireBike(args.bikeId, userId);
      const serializedBike = await withRideStatsIfNeeded(userId, bike, effectiveBikeFields);
      const result = pickFields(serializedBike, effectiveBikeFields);

      if (args.includeComponents) {
        const componentFields = assertAllowedFields(
          args.componentFields,
          COMPONENT_FIELDS,
          "component",
        );
        const effectiveComponentFields =
          args.componentFields && args.componentFields.length > 0
            ? componentFields
            : [...DEFAULT_COMPONENT_FIELDS];

        const parsedFilter = args.componentFilter
          ? parseComponentFilterInput(args.componentFilter)
          : undefined;
        const mergedFilter = mergeMcpComponentFilter(args.activeOnly ?? false, parsedFilter);
        const components = await Promise.all(
          (await listComponentsForBike(bike.id, userId, { filter: mergedFilter })).map(
            serializeComponent,
          ),
        );
        result.components = pickFieldsList(components, effectiveComponentFields);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { bike: result },
      };
    },
  );
}
