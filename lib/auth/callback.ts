/** Where to go after sign-in: a URL on this site only, never another origin. */
export function safeCallbackPath(callback: string | null | undefined, origin: string): string {
  if (!callback) return "/demo";
  try {
    const url = new URL(callback, origin);
    if (url.origin !== origin || (url.protocol !== "https:" && url.protocol !== "http:")) return "/demo";
    // The full URL, so a path like //host cannot be read as another site.
    return url.href;
  } catch {
    return "/demo";
  }
}
