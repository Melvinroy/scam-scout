export const APP_VERSION = "0.9.0";
export const RUBRIC_VERSION = "1.0.0";
export const PROMPT_VERSION = "2026-10-21";

/** Vercel Hobby route cap. The agent must finish before this. */
export const ROUTE_MAX_DURATION_S = 60;
/** Leave time for the final memo and the case.done event. */
export const AGENT_DEADLINE_MS = 50_000;
/** One provider call, including a single retry, stays inside this budget. */
export const PROVIDER_TIMEOUT_MS = 8_000;

export const MODELS = {
  router: process.env.MODEL_ROUTER || "nvidia/Nemotron-3_5-Lightning",
  extract: process.env.MODEL_EXTRACT || "nvidia/nemotron-3-super-120b-a12b",
  vision: process.env.MODEL_VISION || "nvidia/Nemotron-3.5-Super-VL",
  judge: process.env.MODEL_JUDGE || "nvidia/nemotron-3-super-120b-a12b",
};

/** Computed on purpose so a production build still reads the process that started it. */
export function runtimeEnv(): NodeJS.ProcessEnv {
  return process["env"];
}

/** Providers receive API keys, so their base URLs must use HTTPS; only loopback test servers may use HTTP. */
function requireHttps(value: string): string {
  if (value.startsWith("https://")) return value;
  if (/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(value)) return value;
  throw new Error("Provider base URLs must use HTTPS");
}

export function nebiusBaseUrl(env: NodeJS.ProcessEnv = runtimeEnv()): string {
  const raw = env["NEBIUS_BASE_URL"];
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : "https://api.tokenfactory.nebius.com/v1/";
  return requireHttps(value.endsWith("/") ? value : `${value}/`);
}

export function tavilyBaseUrl(env: NodeJS.ProcessEnv = runtimeEnv()): string {
  const raw = env["TAVILY_BASE_URL"];
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : "https://api.tavily.com";
  return requireHttps(value.replace(/\/+$/, ""));
}

export function rdapBaseUrl(env: NodeJS.ProcessEnv = runtimeEnv()): string {
  const raw = env["RDAP_BASE_URL"];
  const value = typeof raw === "string" && raw.trim() ? raw.trim() : "https://rdap.org";
  return value.replace(/\/+$/, "");
}

export const NEBIUS_BASE_URL = nebiusBaseUrl();

export class LimitConfigError extends Error {
  constructor(name: string) {
    super(`limit_config:${name}`);
    this.name = "LimitConfigError";
  }
}

/**
 * A whole-number limit. Blank uses the default. A value that is not a whole number, or is outside
 * [min, max], throws so the caller refuses live checks instead of running with a weaker limit.
 */
export function boundedInt(name: string, fallback: number, bounds: { min?: number; max: number }, env: NodeJS.ProcessEnv = runtimeEnv()): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < (bounds.min ?? 0) || n > bounds.max) throw new LimitConfigError(name);
  return n;
}

export function budgetDefaults() {
  return {
    maxSteps: boundedInt("MAX_STEPS", 8, { max: 16 }),
    maxCredits: boundedInt("MAX_TAVILY_CREDITS", 15, { max: 30 }),
    maxWallMs: Math.min(boundedInt("MAX_WALL_SECONDS", 50, { max: 600 }) * 1000, AGENT_DEADLINE_MS),
    maxTokens: boundedInt("MAX_TOKENS", 120_000, { max: 120_000 }),
    maxScreenshots: boundedInt("MAX_SCREENSHOTS", 2, { max: 4 }),
    maxPages: boundedInt("MAX_PAGES", 12, { max: 24 }),
  };
}

/**
 * Hosted live checks per UTC day across all users. 0 means no daily cap: judges are held by
 * the lifetime model and Tavily stops plus the network, device and hourly limits instead.
 */
export const GLOBAL_LIVE_DAILY_CAP_DEFAULT = 0;

export function quotaDefaults(env: NodeJS.ProcessEnv = runtimeEnv()) {
  return {
    accountAllowance: boundedInt("ACCOUNT_QUOTA", 3, { max: 50 }, env),
    ipDailyCap: boundedInt("IP_DAILY_CAP", 8, { max: 50 }, env),
    deviceDailyCap: boundedInt("DEVICE_DAILY_CAP", 8, { max: 50 }, env),
    ratePerHour: boundedInt("RATE_LIMIT_PER_HOUR", 5, { max: 30 }, env),
    dailyCreditCap: boundedInt("DAILY_CREDIT_CAP", 400, { max: 400 }, env),
    creditsPerLiveCase: boundedInt("CREDITS_PER_LIVE_CASE", 16, { min: 1, max: 400 }, env),
    globalDailyCap: boundedInt("GLOBAL_LIVE_DAILY_CAP", GLOBAL_LIVE_DAILY_CAP_DEFAULT, { max: 1_000 }, env),
  };
}

export function liveKeysConfigured(env: NodeJS.ProcessEnv = runtimeEnv()): boolean {
  return Boolean(env["TAVILY_API_KEY"] && env["NEBIUS_API_KEY"]);
}

export function reportRetentionMs(env: NodeJS.ProcessEnv = runtimeEnv()): number {
  return boundedInt("REPORT_RETENTION_DAYS", 14, { min: 1, max: 90 }, env) * 86_400_000;
}

export function isProduction(env: NodeJS.ProcessEnv = runtimeEnv()): boolean {
  return env.NODE_ENV === "production" || env["VERCEL_ENV"] === "production";
}

/** USD per 1M tokens: [input, output]. */
export const TOKEN_PRICES: Record<string, [number, number]> = {
  "nvidia/Nemotron-3_5-Lightning": [0.06, 0.24],
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": [0.06, 0.24],
  "nvidia/nemotron-3-super-120b-a12b": [0.3, 0.9],
  "nvidia/Nemotron-3.5-Super-VL": [0.3, 0.9],
  "nvidia/Nemotron-3-Ultra-550b-a55b": [1, 3],
};

export const TAVILY_USD_PER_CREDIT = 0.008;
