import { isProduction, runtimeEnv } from "@/lib/config";

export interface TurnstileResult {
  ok: boolean;
  reason: string;
  hostname?: string;
  errorCodes?: string[];
}

export async function verifyTurnstile(options: {
  token: string | undefined;
  secret: string | undefined;
  remoteIp?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
  const env = options.env ?? runtimeEnv();
  if (!options.secret) {
    if (isProduction(env)) return fail("turnstile_not_configured");
    return { ok: true, reason: "dev_bypass" };
  }
  if (!options.token) return fail("missing_token");
  const allowed = allowedTurnstileHosts(env);
  if (allowed.length === 0) return fail("turnstile_hostname");
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = new URLSearchParams();
  body.set("secret", options.secret);
  body.set("response", options.token);
  if (options.remoteIp) body.set("remoteip", options.remoteIp);
  const verifyUrl = env["TURNSTILE_VERIFY_URL"]?.trim() || "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  try {
    const res = await fetchImpl(verifyUrl, { method: "POST", body });
    if (!res.ok) return fail("turnstile_http");
    const json = (await res.json()) as { success?: boolean; hostname?: string; "error-codes"?: unknown };
    const hostname = typeof json.hostname === "string" ? json.hostname : undefined;
    const errorCodes = errorCodeList(json["error-codes"]);
    if (!json.success) return fail("turnstile_rejected", hostname, errorCodes);
    const got = (hostname ?? "").toLowerCase();
    if (!allowed.includes(got)) return fail("turnstile_hostname", hostname, errorCodes);
    return { ok: true, reason: "verified", ...(hostname ? { hostname } : {}) };
  } catch {
    return fail("turnstile_unreachable");
  }
}

/** Configured site URL and the hosts this deployment publishes. Request headers are not a source. */
export function allowedTurnstileHosts(env: NodeJS.ProcessEnv): string[] {
  const hosts = new Set<string>();
  addHost(hosts, env["NEXT_PUBLIC_SITE_URL"]);
  addHost(hosts, env["AUTH_URL"]);
  addHost(hosts, env["VERCEL_URL"]);
  addHost(hosts, env["VERCEL_BRANCH_URL"]);
  addHost(hosts, env["VERCEL_PROJECT_PRODUCTION_URL"]);
  return [...hosts];
}

/** What the visitor should do next. The reason code stays in the log, not in this sentence. */
/** One public line for every failed human check. */
export const TURNSTILE_CLIENT_MESSAGE = "The live check could not start. Try again.";

function fail(reason: string, hostname?: string, errorCodes?: string[]): TurnstileResult {
  const result: TurnstileResult = {
    ok: false,
    reason,
    ...(hostname ? { hostname } : {}),
    ...(errorCodes && errorCodes.length ? { errorCodes } : {}),
  };
  console.error(JSON.stringify({
    msg: "turnstile_failed",
    reason: result.reason,
    hostname: result.hostname ?? null,
    errorCodes: result.errorCodes ?? [],
  }));
  return result;
}

function errorCodeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 80);
}

function addHost(hosts: Set<string>, raw: string | undefined): void {
  const host = raw ? hostOf(raw) : undefined;
  if (host) hosts.add(host);
}

function hostOf(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  try {
    const withScheme = value.includes("://") ? value : `https://${value}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host || undefined;
  } catch {
    return undefined;
  }
}
