import type { RequestHandler } from "express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { Express } from "express";
import { extractApiKeyFromHeaders, verifyGraphQLApiKey } from "../lib/api-key-auth.js";
import { logger } from "../lib/logging/index.js";
import { toAuthInfo } from "./context.js";
import { createMcpServer } from "./index.js";

const MCP_PROTOCOL_VERSION = "2025-11-25";

function unauthorizedResponse(res: Parameters<RequestHandler>[1]): void {
  res.setHeader("WWW-Authenticate", "Bearer");
  res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized",
    },
    id: null,
  });
}

export const mcpAuthMiddleware: RequestHandler = async (req, res, next) => {
  const token = extractApiKeyFromHeaders({
    get(name: string) {
      const value = req.headers[name.toLowerCase()];
      if (Array.isArray(value)) return value[0];
      return value;
    },
  });

  if (!token) {
    logger.warn({ event: "mcp.auth", reason: "missing_key" }, "MCP unauthorized");
    unauthorizedResponse(res);
    return;
  }

  const verified = await verifyGraphQLApiKey(token);
  if (!verified) {
    logger.warn({ event: "mcp.auth", reason: "invalid_key" }, "MCP unauthorized");
    unauthorizedResponse(res);
    return;
  }

  req.auth = toAuthInfo({
    userId: verified.userId,
    permissions: verified.permissions,
    token: verified.token,
  });
  next();
};

export function mountMcp(app: Express): void {
  app.all("/mcp", mcpAuthMiddleware, (req, res) => {
    res.setHeader("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);

    const server = createMcpServer();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    void (async () => {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    })().catch((err) => {
      logger.error({ event: "mcp.transport", err }, "MCP request failed");
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        });
      }
    });
  });
}
