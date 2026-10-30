/**
 * CSRF guard for cookie-authenticated form posts. SameSite=Lax still lets a sibling
 * subdomain post, so the browser's Origin must name the host it is talking to.
 * Behind a proxy request.url can carry an internal host, so the forwarded Host is used.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const self = new URL(request.url);
    // Vercel overwrites x-forwarded-host and x-forwarded-proto, so the full origin (scheme and host) is platform-set.
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? self.host;
    const scheme = request.headers.get("x-forwarded-proto") ?? self.protocol.replace(/:$/, "");
    const claimed = new URL(origin);
    return claimed.protocol === `${scheme}:` && claimed.host === host;
  } catch {
    return false;
  }
}

/**
 * Guard for cookie-authenticated JSON posts: 403 unless same-origin, 415 unless the body is
 * declared application/json (a cross-site form or text/plain post cannot set that type without a preflight).
 */
export function rejectCrossSite(request: Request): Response | null {
  if (!isSameOrigin(request)) return Response.json({ ok: false, error: "Request refused." }, { status: 403 });
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return Response.json({ ok: false, error: "Send JSON." }, { status: 415 });
  return null;
}
