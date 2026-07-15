import type { McpServer } from "@modelcontextprotocol/server";
import { CATEGORIES } from "shared";
import { z } from "zod";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { pickFieldsList } from "../field-selection.js";
import {
  assertAllowedFields,
  CATEGORY_FIELDS,
  DEFAULT_CATEGORY_FIELDS,
} from "../schema-catalog.js";
import { withMcpToolLog } from "../tool-log.js";

export function registerListComponentCategoriesTool(server: McpServer): void {
  server.registerTool(
    "list_component_categories",
    {
      title: "List component categories",
      description: "List the fixed MyBike component categories.",
      inputSchema: z.object({
        fields: z.array(z.string()).optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("list_component_categories", auth, args, async () => {
        requireReadPermission(auth);
        const fields = assertAllowedFields(args.fields, CATEGORY_FIELDS, "category");
        const effectiveFields =
          args.fields && args.fields.length > 0 ? fields : [...DEFAULT_CATEGORY_FIELDS];

        const categories = CATEGORIES.map((category) => ({
          id: category.id,
          label: category.label,
          order: category.order,
        }));
        const result = pickFieldsList(categories, effectiveFields);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: { categories: result },
        };
      });
    },
  );
}
