import type { McpServer } from "@modelcontextprotocol/server";
import { CATEGORY_IDS } from "shared";
import { z } from "zod";
import { listMaintenanceTasksForBike } from "../../services/maintenance.js";
import { getMcpAuth, requireReadPermission } from "../context.js";
import { pickFieldsList } from "../field-selection.js";
import {
  assertAllowedFields,
  DEFAULT_MAINTENANCE_TASK_FIELDS,
  MAINTENANCE_TASK_FIELDS,
} from "../schema-catalog.js";
import { withMcpToolLog } from "../tool-log.js";

export function registerListMaintenanceTasksTool(server: McpServer): void {
  server.registerTool(
    "list_maintenance_tasks",
    {
      title: "List maintenance tasks",
      description: "List maintenance tasks for a bike with optional filters and field selection.",
      inputSchema: z.object({
        bikeId: z.string().min(1),
        category: z.enum(CATEGORY_IDS).optional(),
        kind: z.enum(["touch_up", "periodic", "eol"]).optional(),
        enabledOnly: z.boolean().optional(),
        fields: z.array(z.string()).optional(),
      }),
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("list_maintenance_tasks", auth, args, async () => {
        const userId = requireReadPermission(auth);
        const fields = assertAllowedFields(
          args.fields,
          MAINTENANCE_TASK_FIELDS,
          "maintenance task",
        );
        const effectiveFields =
          args.fields && args.fields.length > 0 ? fields : [...DEFAULT_MAINTENANCE_TASK_FIELDS];

        let tasks = await listMaintenanceTasksForBike(args.bikeId, userId);
        if (args.enabledOnly !== false) tasks = tasks.filter((task) => task.enabled);
        if (args.kind) tasks = tasks.filter((task) => task.kind === args.kind);
        if (args.category) {
          tasks = tasks.filter((task) => task.componentCategory === args.category);
        }

        const result = pickFieldsList(
          tasks.map((task) => ({ ...task })),
          effectiveFields,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: { bikeId: args.bikeId, tasks: result },
        };
      });
    },
  );
}
