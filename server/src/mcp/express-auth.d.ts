import type { AuthInfo } from "@modelcontextprotocol/server";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthInfo;
  }
}

export {};
