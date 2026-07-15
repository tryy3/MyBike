import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { activateComponent } from "../../services/components.js";
import { getMcpAuth, requireWritePermission } from "../context.js";
import { serializeComponent } from "../serialize.js";
import { withMcpToolLog } from "../tool-log.js";

const setActiveComponentInputSchema = z.object({
  componentId: z.string().uuid(),
});

export function registerSetActiveComponentTool(server: McpServer): void {
  server.registerTool(
    "set_active_component",
    {
      title: "Set active component",
      description:
        "Activate an existing component (deactivates siblings in the same bike+category). Use for rotating spare parts (e.g. waxed chains). Does not create a service record — use replace_component for EOL replacement.",
      inputSchema: setActiveComponentInputSchema,
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog(
        "set_active_component",
        auth,
        args,
        async () => {
          const userId = requireWritePermission(auth);
          const row = await activateComponent(args.componentId, userId);
          const component = await serializeComponent(row);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(component, null, 2) }],
            structuredContent: { component },
          };
        },
        (result) => ({ componentId: result.structuredContent.component.id }),
      );
    },
  );
}
