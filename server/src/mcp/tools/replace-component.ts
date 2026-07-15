import type { McpServer } from "@modelcontextprotocol/server";
import { CATEGORY_IDS } from "shared";
import { z } from "zod";
import { badRequest } from "../../lib/errors.js";
import {
  listMaintenanceTasksForBike,
  replaceComponentMaintenance,
} from "../../services/maintenance.js";
import { getMcpAuth, requireWritePermission } from "../context.js";
import { withMcpToolLog } from "../tool-log.js";

const inputSchema = z
  .object({
    taskId: z.string().uuid().optional(),
    bikeId: z.string().uuid().optional(),
    category: z.enum(CATEGORY_IDS).optional(),
    newComponentId: z.string().uuid(),
    notes: z.string().max(5000).nullish(),
    cost: z.number().min(0).nullish(),
    resetWear: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasTask = data.taskId != null;
    const hasBikeCat = data.bikeId != null && data.category != null;
    if (hasTask === hasBikeCat) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either taskId, or both bikeId and category",
      });
    }
  });

export function registerReplaceComponentTool(server: McpServer): void {
  server.registerTool(
    "replace_component",
    {
      title: "Replace component",
      description:
        "Replace a component through its EOL maintenance task and create a service record. Prefer due, overdue, or soon tasks; early replacement is allowed. Use after create_component. Not for spare rotation; use set_active_component instead.",
      inputSchema,
    },
    async (args, ctx) => {
      const auth = getMcpAuth(ctx);
      return withMcpToolLog("replace_component", auth, args, async () => {
        const userId = requireWritePermission(auth);
        const data = inputSchema.parse(args);
        let taskId = data.taskId;

        if (!taskId) {
          const tasks = await listMaintenanceTasksForBike(data.bikeId!, userId);
          const matches = tasks.filter(
            (task) =>
              task.enabled && task.kind === "eol" && task.componentCategory === data.category,
          );
          if (matches.length !== 1) {
            throw badRequest(
              `Expected exactly one enabled EOL task for ${data.category}; found ${matches.length}`,
            );
          }
          taskId = matches[0]!.id;
        }

        const record = await replaceComponentMaintenance(taskId, userId, {
          newComponentId: data.newComponentId,
          notes: data.notes ?? null,
          cost: data.cost,
          resetWear: data.resetWear ?? true,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(record, null, 2) }],
          structuredContent: { serviceRecord: record },
        };
      });
    },
  );
}
