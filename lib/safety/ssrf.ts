import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^255\.255\.255\.255$/,
];

export function isPrivateIp(ip: string): boolean {
  const value = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!value) return true;
  if (value === "::" || value === "::1" || value === "0.0.0.0") return true;
  // Ranges apply to IP literals only. A hostname such as health-office.example is checked after DNS resolution.
  if (isIP(value) === 0) return false;
  if (/^(fe[89a-f][0-9a-f]|ff[0-9a-f]{2}):/.test(value) || value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("::ffff:")) return isPrivateIp(mappedIpv4(value.slice(7)));
  if (value.includes(":")) return false;
  return PRIVATE_V4.some((pattern) => pattern.test(value));
}

/** URL parsing rewrites ::ffff:127.0.0.1 as ::ffff:7f00:1; read both forms. An unreadable tail stays blocked. */
function mappedIpv4(tail: string): string {
  if (tail.includes(".")) return tail;
  const groups = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if (!groups) return "";
  const high = parseInt(groups[1], 16);
  const low = parseInt(groups[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function assertPublicHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("URL is not valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be captured.");
  }
  if (url.username || url.password) throw new Error("URLs with credentials are blocked.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Local hostnames are blocked.");
  }
  if (isPrivateIp(host)) throw new Error("Private and metadata addresses are blocked.");
  return url;
}

const URL_FETCH_ACTIONS = new Set(["extract_pages", "map_site", "crawl_site", "screenshot"]);

/** Our own fetches and the URLs we hand to a research provider. Search text is not a URL. */
export function blockedFetchReason(action: string, query: string): "blocked_url" | null {
  if (URL_FETCH_ACTIONS.has(action)) {
    try {
      assertPublicHttpUrl(query);
      return null;
    } catch {
      return "blocked_url";
    }
  }
  if (action === "rdap") {
    const host = query.trim().toLowerCase().replace(/\.$/, "");
    if (
      !host ||
      host.includes("/") ||
      isPrivateIp(host) ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return "blocked_url";
    }
  }
  return null;
}

export type AddressLookup = (hostname: string) => Promise<string[]>;

export async function defaultAddressLookup(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

/** Lexical checks, then DNS. Any private answer, or a failed lookup, is refused. */
export async function resolvePublicHttpUrl(input: string, lookupImpl: AddressLookup = defaultAddressLookup): Promise<URL> {
  return (await resolvePublicTarget(input, lookupImpl)).url;
}

interface ResolvedTarget {
  url: URL;
  /** The only addresses the connection may use, so DNS cannot change between check and connect. */
  addresses: string[];
}

async function resolvePublicTarget(input: string, lookupImpl: AddressLookup): Promise<ResolvedTarget> {
  const url = assertPublicHttpUrl(input);
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal)) return { url, addresses: [literal] };
  let addresses: string[] = [];
  try {
    addresses = await lookupImpl(url.hostname);
  } catch {
    throw new Error("Private and metadata addresses are blocked.");
  }
  if (addresses.length === 0 || addresses.some((address) => isPrivateIp(address))) {
    throw new Error("Private and metadata addresses are blocked.");
  }
  return { url, addresses };
}

/** A DNS lookup that answers every hostname with the already-checked addresses. */
export function pinnedLookup(addresses: string[]): LookupFunction {
  const records = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_hostname, options, callback) => {
    if (options.all) callback(null, records);
    else callback(null, records[0].address, records[0].family);
  };
}

const platformFetch = globalThis.fetch;

/** The platform fetch cannot take a pinned lookup, so it is swapped for undici's fetch with one. */
function sendPinned(fetchImpl: typeof fetch, target: ResolvedTarget, init: RequestInit): Promise<Response> {
  const dispatcher = new Agent({ connect: { lookup: pinnedLookup(target.addresses) }, keepAliveTimeout: 1_000 });
  const pinnedInit = { ...init, dispatcher } as RequestInit;
  if (fetchImpl !== platformFetch) return fetchImpl(target.url.toString(), pinnedInit);
  return undiciFetch(target.url.toString(), pinnedInit as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 4;

/**
 * Fetch with redirects followed by hand. Each hop is resolved again.
 * A trusted host is an operator-configured provider origin: a literal address there
 * may be loopback, and a hostname there is still rejected when it resolves privately.
 */
export async function fetchPublic(
  input: string,
  init: RequestInit = {},
  options: { fetchImpl?: typeof fetch; lookup?: AddressLookup; trustedHosts?: string[]; followRedirects?: boolean } = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupImpl = options.lookup ?? defaultAddressLookup;
  const trusted = new Set((options.trustedHosts ?? []).map((host) => host.toLowerCase()));
  let current = await resolveHop(input, trusted, lookupImpl);
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await sendPinned(fetchImpl, current, { ...init, method, headers, body, redirect: "manual" });
    // Billed provider calls pass followRedirects: false, so one reservation never covers a second request.
    if (!REDIRECT.has(res.status) || options.followRedirects === false) return res;
    const location = res.headers.get("location");
    if (!location || hop === MAX_REDIRECTS) throw new Error("Too many redirects.");
    const target = new URL(location, current.url);
    if (current.url.protocol === "https:" && target.protocol === "http:") throw new Error("Redirect downgrade to http is blocked.");
    const next = await resolveHop(target.toString(), trusted, lookupImpl);
    if (next.url.origin !== current.url.origin) {
      body = undefined;
      stripCredentialHeaders(headers);
    }
    current = next;
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== "GET" && method !== "HEAD")) {
      method = "GET";
      body = undefined;
    }
  }
  throw new Error("Too many redirects.");
}

function stripCredentialHeaders(headers: Headers): void {
  for (const name of [...headers.keys()]) {
    const value = name.toLowerCase();
    if (value === "authorization" || value.includes("api-key") || value.includes("apikey") || value.includes("api_key") || value.includes("signature")) {
      headers.delete(name);
    }
  }
}

async function resolveHop(input: string, trusted: Set<string>, lookupImpl: AddressLookup): Promise<ResolvedTarget> {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (trusted.has(host) && isIP(host)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https URLs can be captured.");
    if (url.username || url.password) throw new Error("URLs with credentials are blocked.");
    return { url, addresses: [host] };
  }
  return resolvePublicTarget(url.toString(), lookupImpl);
}
