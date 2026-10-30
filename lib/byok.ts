const KEY = /^[A-Za-z0-9._-]{16,200}$/;

export type ByokParse =
  | { kind: "none" }
  | { kind: "incomplete" }
  | { kind: "ready"; researchKey: string; modelKey: string };

/** Read optional browser keys from a request body. Never log the return value. */
export function parseByok(input: { researchKey?: unknown; modelKey?: unknown }): ByokParse {
  const researchKey = typeof input.researchKey === "string" ? input.researchKey.trim() : "";
  const modelKey = typeof input.modelKey === "string" ? input.modelKey.trim() : "";
  if (!researchKey && !modelKey) return { kind: "none" };
  if (!KEY.test(researchKey) || !KEY.test(modelKey)) return { kind: "incomplete" };
  return { kind: "ready", researchKey, modelKey };
}

/** Hosted keys travel with the request secrets so a provider error cannot echo them. */
export function hostedSecrets(env: NodeJS.ProcessEnv, extra: string[] = []): string[] {
  const hosted = [
    env["TAVILY_API_KEY"],
    env["NEBIUS_API_KEY"],
    env["TURNSTILE_SECRET_KEY"],
    env["AUTH_SECRET"],
    env["UPSTASH_REDIS_REST_TOKEN"],
    env["AUTH_GOOGLE_SECRET"],
    env["GOOGLE_CLIENT_SECRET"],
  ].filter((item): item is string => typeof item === "string" && item.length >= 8);
  return [...hosted, ...extra.filter((item) => item.length >= 8)];
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function mentionsKey(text: string, keys: string[]): boolean {
  return keys.some((key) => key.length >= 8 && text.includes(key));
}

export function redactJson<T>(value: T, secrets: string[]): T {
  return JSON.parse(redactSecrets(JSON.stringify(value), secrets)) as T;
}

export function scrubSecrets(message: string, secrets: string[]): string {
  return redactSecrets(message, secrets).slice(0, 300);
}
