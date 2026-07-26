import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { archiveComponent } from "../../services/components.js";
import { getMcpAuth, requireWritePermission } from "../context.js";
import { serializeComponent } from "../serialize.js";
import { withMcpToolLog } from "../tool-log.js";

const archiveComponentInputSchema = z.object({
  componentId: z.string().uuid(),
});

export function registerArchiveComponentTool(server: McpServer): void {
  server.registerTool(
    "archive_component",
    {
      title: "Archive component",
      description:
        "Archive an inactive component so it leaves the active/alternate rotation without deleting it. Fails if the component is active or already archived. Prefer after EOL replace (or pass archiveOld on replace_component). Unarchive is UI-only.",
      inputSchema: archiveComponentInputSchema,
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog(
        "archive_component",
        auth,
        args,
        async () => {
          const userId = requireWritePermission(auth);
          const row = await archiveComponent(args.componentId, userId);
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
