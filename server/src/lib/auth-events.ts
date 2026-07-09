/** Endpoint context passed to Better Auth database hooks (path only; no secrets). */
type AuthHookContext = { path?: string; params?: { id?: string } } | null | undefined;

/** Classify how a session was created from the request path (for logging only). */
export function resolveAuthMethod(ctx: AuthHookContext): string {
  const path = ctx?.path ?? "";
  if (path.startsWith("/callback/")) {
    return ctx?.params?.id ?? path.split("/").pop() ?? "oauth";
  }
  if (path.includes("/sign-in") || path.includes("/sign-up")) {
    return "email";
  }
  return "unknown";
}
