const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (URL_SCHEME_RE.test(value)) return undefined;
  if (hasControlCharacters(value)) return undefined;
  return value;
}
