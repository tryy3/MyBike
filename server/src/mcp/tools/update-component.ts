import type { McpServer } from "@modelcontextprotocol/server";
import { componentUpdateSchema } from "shared";
import { z } from "zod";
import { updateComponent } from "../../services/components.js";
import { getMcpAuth, requireWritePermission } from "../context.js";
import { serializeComponent } from "../serialize.js";
import { withMcpToolLog } from "../tool-log.js";

const mcpComponentUpdateSchema = z
  .object({
    componentId: z.string().uuid(),
    brand: z.string().trim().min(1).max(200).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(5000).nullish(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish(),
    purchaseCost: z.number().min(0).nullish(),
    purchaseStore: z.string().max(200).nullish(),
  })
  .strict();

export function registerUpdateComponentTool(server: McpServer): void {
  server.registerTool(
    "update_component",
    {
      title: "Update component",
      description:
        "Updates a component's brand, model, notes, and purchase details. The component name cannot be changed.",
      inputSchema: mcpComponentUpdateSchema,
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("update_component", auth, args, async () => {
        const userId = requireWritePermission(auth);
        const { componentId, ...argsWithoutComponentId } = args;
        const parsed = componentUpdateSchema.parse(argsWithoutComponentId);
        const row = await updateComponent(componentId, userId, parsed);
        const component = await serializeComponent(row);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(component, null, 2) }],
          structuredContent: { component },
        };
      });
    },
  );
}
