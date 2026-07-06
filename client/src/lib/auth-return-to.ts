const RETURN_TO_KEY = "auth.returnTo:v1";

const AUTH_PATHS = new Set(["/login", "/register"]);

/**
 * Validates a post-auth destination. Only same-origin relative paths are allowed.
 */
export function getSafeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  const pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
  if (AUTH_PATHS.has(pathname)) {
    return fallback;
  }

  return trimmed;
}

/** Store the current location when redirecting an unauthenticated user to login. */
export function saveAuthReturnTo(): void {
  try {
    const path = window.location.pathname + window.location.search + window.location.hash;
    const safe = getSafeRedirectPath(path, "");
    if (!safe) {
      return;
    }
    sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // sessionStorage unavailable (private browsing, disabled, etc.)
  }
}

/** Read the stored return path without clearing it. */
export function peekAuthReturnTo(fallback = "/"): string {
  try {
    const raw = sessionStorage.getItem(RETURN_TO_KEY);
    return getSafeRedirectPath(raw, fallback);
  } catch {
    return fallback;
  }
}

/** Discard any stored post-auth return path (e.g. after sign-out). */
export function clearAuthReturnTo(): void {
  try {
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // sessionStorage unavailable (private browsing, disabled, etc.)
  }
}

/** Read and clear the stored return path, falling back when missing or invalid. */
export function consumeAuthReturnTo(fallback = "/"): string {
  try {
    const raw = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return getSafeRedirectPath(raw, fallback);
  } catch {
    return fallback;
  }
}
