import { logger } from "../lib/logging/index.js";
import type { McpAuthContext } from "./context.js";

const LONG_STRING = 200;

export function summarizeMcpArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value === "string" && value.length > LONG_STRING) {
      out[key] = `${value.slice(0, LONG_STRING)}…`;
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export async function withMcpToolLog<TArgs, TResult>(
  tool: string,
  auth: McpAuthContext,
  args: TArgs,
  fn: () => Promise<TResult>,
): Promise<TResult> {
  const started = Date.now();
  try {
    const result = await fn();
    logger.info(
      {
        event: "mcp.tool",
        userId: auth.userId,
        tool,
        outcome: "ok",
        durationMs: Date.now() - started,
        args: summarizeMcpArgs(args),
      },
      `MCP tool ${tool} ok`,
    );
    return result;
  } catch (err) {
    logger.info(
      {
        event: "mcp.tool",
        userId: auth.userId,
        tool,
        outcome: "error",
        durationMs: Date.now() - started,
        args: summarizeMcpArgs(args),
        err,
      },
      `MCP tool ${tool} error`,
    );
    throw err;
  }
}
