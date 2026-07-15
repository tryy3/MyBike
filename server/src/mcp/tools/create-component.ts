import type { McpServer } from "@modelcontextprotocol/server";
import { componentInsertSchema } from "shared";
import { z } from "zod";
import { createComponent } from "../../services/components.js";
import { getMcpAuth, requireWritePermission } from "../context.js";
import { serializeComponent } from "../serialize.js";
import { withMcpToolLog } from "../tool-log.js";

const createComponentInputSchema = componentInsertSchema
  .pick({
    category: true,
    name: true,
    brand: true,
    model: true,
    notes: true,
    purchaseDate: true,
    purchaseCost: true,
    purchaseStore: true,
  })
  .extend({ bikeId: z.string().min(1) });

export function registerCreateComponentTool(server: McpServer): void {
  server.registerTool(
    "create_component",
    {
      title: "Create component",
      description:
        "Creates a component. Always inactive when another exists in the category; use set_active_component or replace_component to activate. First component in a category is forced active by the server.",
      inputSchema: createComponentInputSchema,
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("create_component", auth, args, async () => {
        const userId = requireWritePermission(auth);
        const { bikeId, ...argsWithoutBikeId } = args;
        const parsed = componentInsertSchema.parse({
          ...argsWithoutBikeId,
          isActive: false,
        });
        const row = await createComponent(bikeId, userId, parsed);
        const component = await serializeComponent(row);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(component, null, 2) }],
          structuredContent: { component },
        };
      });
    },
  );
}
