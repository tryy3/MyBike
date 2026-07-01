export const DEV_AUTH_SECRET = "dev-secret-change-me-in-production-32chars";

interface AuthEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  CLIENT_URL?: string;
  NODE_ENV?: string;
}

export interface AuthConfig {
  secret: string;
  baseURL: string;
  clientURL: string;
}

function parseUrl(name: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
}

function isLocalDevUrl(url: URL): boolean {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1"
  );
}

function assertPublicHttpsUrl(name: string, url: URL): void {
  if (!isLocalDevUrl(url) && url.protocol !== "https:") {
    throw new Error(`${name} must use https:// outside local development`);
  }
}

export function resolveAuthConfig(env: AuthEnv = process.env): AuthConfig {
  const secret = env.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL ?? "http://localhost:3001";
  const clientURL = env.CLIENT_URL ?? "http://localhost:5173";
  const base = parseUrl("BETTER_AUTH_URL", baseURL);
  const client = parseUrl("CLIENT_URL", clientURL);
  const productionLike =
    env.NODE_ENV === "production" ||
    !isLocalDevUrl(base) ||
    !isLocalDevUrl(client);

  if (productionLike) {
    if (!env.BETTER_AUTH_SECRET || secret === DEV_AUTH_SECRET) {
      throw new Error(
        "BETTER_AUTH_SECRET must be set to a unique production secret",
      );
    }
    if (secret.length < 32) {
      throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
    }
    assertPublicHttpsUrl("BETTER_AUTH_URL", base);
    assertPublicHttpsUrl("CLIENT_URL", client);
  }

  return { secret, baseURL, clientURL };
}
