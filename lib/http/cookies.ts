import { isProduction, runtimeEnv } from "@/lib/config";
import { readSigned, signPayload } from "@/lib/safety/sign";

export function signingSecret(env: NodeJS.ProcessEnv = runtimeEnv()): string | null {
  const secret = env["AUTH_SECRET"]?.trim();
  return secret || null;
}

/**
 * 303 back to a path on the host the browser used.
 * Next's request URL can be an internal hostname, and an absolute Location
 * would drop the session cookie on the way back to the captures desk.
 */
export function redirectSeeOther(path: string): Response {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("redirect path");
  return new Response(null, { status: 303, headers: { Location: path } });
}

/** Secure cookies only when the request URL is https. Forwarded protocol headers are not a source. */
export function cookieSecure(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return isProduction();
  }
}

/** Platform address. The first X-Forwarded-For hop is client-controlled, so it is ignored. */
export function clientIp(request: Request, env: NodeJS.ProcessEnv = runtimeEnv()): string {
  const platform = request.headers.get("x-vercel-forwarded-for");
  if (platform) {
    const ip = platform.split(",").map((part) => part.trim()).find((part) => part.length > 0);
    if (ip) return ip;
  }
  if (!isProduction(env)) {
    const real = request.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "0.0.0.0";
}

export function readHumanCookie(token: string | undefined, userId: string | undefined, now = Date.now()): boolean {
  if (!userId) return false;
  const secret = signingSecret();
  if (!secret || !token) return false;
  const payload = readSigned<{ ok?: boolean; exp?: number; sub?: string }>(token, secret);
  return Boolean(payload?.ok && payload.exp && payload.exp > now && payload.sub === userId);
}

export function humanCookieValue(userId: string): string | null {
  if (!userId) return null;
  const secret = signingSecret();
  if (!secret) return null;
  return signPayload({ ok: true, sub: userId, exp: Date.now() + 12 * 60 * 60 * 1000 }, secret);
}

export function readUsageCookie(token: string | undefined, userId: string): number | undefined {
  const secret = signingSecret();
  if (!secret) return undefined;
  const payload = readSigned<{ sub?: string; used?: number }>(token, secret);
  if (!payload || payload.sub !== userId || typeof payload.used !== "number") return undefined;
  return payload.used;
}

export function usageCookieValue(userId: string, used: number): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  return signPayload({ sub: userId, used }, secret);
}
