import type { GenericEndpointContext } from "@better-auth/core";
import { permissionsForScope, scopeFromApiKeyMetadata } from "shared";

export async function resolveDefaultApiKeyPermissions(
  _referenceId: string,
  ctx: GenericEndpointContext,
): Promise<Record<string, string[]>> {
  const metadata =
    ctx.body && typeof ctx.body === "object" && "metadata" in ctx.body
      ? (ctx.body as { metadata?: unknown }).metadata
      : undefined;
  return permissionsForScope(scopeFromApiKeyMetadata(metadata));
}
