export function getSafeRedirectPath(
  redirectTo: string | undefined,
  fallback = "/",
) {
  if (!redirectTo) {
    return fallback;
  }

  try {
    const url = new URL(redirectTo, window.location.origin);
    if (url.origin !== window.location.origin) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}
