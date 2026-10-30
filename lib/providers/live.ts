import { MODELS, PROVIDER_TIMEOUT_MS, TOKEN_PRICES, nebiusBaseUrl, rdapBaseUrl, tavilyBaseUrl } from "@/lib/config";
import { TAVILY_WORST } from "@/lib/safety/tavily-cost";
import type { CrawlResponse, ExtractResponse, LlmProvider, LlmRequest, LlmResponse, MapResponse, RdapProvider, RdapResult, ResearchProvider, ScreenshotProvider, SearchRequest, SearchResponse } from "@/lib/providers/types";
import { signPayload } from "@/lib/safety/sign";
import { asRecord } from "@/lib/safety/untrusted";
import { blockedFetchReason, fetchPublic, resolvePublicHttpUrl } from "@/lib/safety/ssrf";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "quota" | "rate" | "http" | "upstream" | "network",
  ) {
    super(message);
  }
}

function parseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function createTavilyResearch(apiKey: string, fetchImpl: typeof fetch = fetch): ResearchProvider {
  async function post(
    path: string,
    body: Record<string, unknown>,
    signal: AbortSignal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  ): Promise<{ json: Record<string, unknown>; credits: number; usageOmitted: boolean }> {
    const base = tavilyBaseUrl();
    let res: Response;
    try {
      res = await fetchPublic(`${base}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ api_key: apiKey, include_usage: true, ...body }),
        signal,
      }, { fetchImpl, trustedHosts: trustedHost(base), followRedirects: false });
    } catch {
      throw new ProviderError("research network", "network");
    }
    if (res.status === 432 || res.status === 433) {
      throw new ProviderError(`research quota ${res.status}`, "quota");
    }
    // No retry: each HTTP request must pass the per-check call cap, so a 429 fails this call.
    // Any HTTP response means the request was sent, so the meter keeps the reservation for every status.
    if (!res.ok) throw new ProviderError(`research ${path} failed (${res.status})`, res.status >= 500 ? "upstream" : "http");
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    // A 200 with an error envelope or no result list may still be billed, so it fails and keeps the reservation.
    if (!validResearchBody(path, json)) {
      throw new ProviderError(`research ${path} malformed response`, "upstream");
    }
    const usage = json.usage as { credits?: number } | undefined;
    const reported = usage?.credits;
    // Only a whole, non-negative count is a usage reading. Anything else is charged at the worst case.
    const usageOmitted = typeof reported !== "number" || !Number.isSafeInteger(reported) || reported < 0;
    const credits = usageOmitted ? estimateCredits(path, body) : reported;
    return { json, credits, usageOmitted };
  }

  return {
    async search(request: SearchRequest): Promise<SearchResponse> {
      const { json, credits, usageOmitted } = await post("search", {
        query: request.query,
        search_depth: request.depth,
        max_results: request.maxResults,
        topic: request.topic ?? "general",
        include_domains: request.includeDomains,
        include_answer: false,
      });
      const results = Array.isArray(json.results) ? json.results : [];
      return {
        requestId: typeof json.request_id === "string" ? json.request_id : undefined,
        credits,
        ...(usageOmitted ? { usageOmitted } : {}),
        results: results.map((item) => {
          const row = item as { url?: string; title?: string; content?: string };
          return { url: row.url ?? "", title: row.title ?? "", content: row.content ?? "" };
        }),
      };
    },
    async extract(urls: string[], query: string): Promise<ExtractResponse> {
      const allowed = await publicUrls(urls);
      if (!allowed.length) return { credits: 0, failed: urls, pages: [] };
      const { json, credits, usageOmitted } = await post("extract", { urls: allowed, query, extract_depth: "basic" });
      const results = Array.isArray(json.results) ? json.results : [];
      const failed = Array.isArray(json.failed_results) ? json.failed_results.map(String) : [];
      return {
        credits,
        ...(usageOmitted ? { usageOmitted } : {}),
        failed,
        pages: results.map((item) => {
          const row = item as { url?: string; title?: string; raw_content?: string; content?: string };
          return { url: row.url ?? "", title: row.title ?? row.url ?? "", content: row.raw_content ?? row.content ?? "" };
        }),
      };
    },
    async map(url: string): Promise<MapResponse> {
      if (!(await isPublicTarget(url))) return { urls: [], credits: 0 };
      const { json, credits, usageOmitted } = await post("map", { url, max_depth: 2, limit: 40 });
      const urls = Array.isArray(json.results) ? json.results.map(String) : Array.isArray(json.urls) ? json.urls.map(String) : [];
      return { urls, credits, ...(usageOmitted ? { usageOmitted } : {}) };
    },
    async crawl(url: string, instructions: string): Promise<CrawlResponse> {
      if (!(await isPublicTarget(url))) return { credits: 0, pages: [] };
      const { json, credits, usageOmitted } = await post("crawl", { url, instructions, max_depth: 1, limit: 10, extract_depth: "basic" });
      const results = Array.isArray(json.results) ? json.results : [];
      return {
        credits,
        ...(usageOmitted ? { usageOmitted } : {}),
        pages: results.map((item) => {
          const row = item as { url?: string; title?: string; raw_content?: string };
          return { url: row.url ?? "", title: row.title ?? "", content: row.raw_content ?? "" };
        }),
      };
    },
  };
}

async function publicUrls(urls: string[]): Promise<string[]> {
  const allowed: string[] = [];
  for (const url of urls) {
    if (await isPublicTarget(url)) allowed.push(url);
  }
  return allowed;
}

async function isPublicTarget(url: string): Promise<boolean> {
  if (blockedFetchReason("extract_pages", url)) return false;
  try {
    await resolvePublicHttpUrl(url);
    return true;
  } catch {
    return false;
  }
}

function trustedHost(base: string): string[] {
  try {
    return [new URL(base).hostname.toLowerCase()];
  } catch {
    return [];
  }
}

// Validate result fields before trusting usage: malformed billed work keeps its reservation.
function validResearchBody(path: string, json: unknown): json is Record<string, unknown> {
  const body = asRecord(json);
  if (!body || "error" in body || "detail" in body) return false;
  if (path === "map") {
    return (Array.isArray(body.results) || Array.isArray(body.urls)) &&
      ["results", "urls"].every((field) => !(field in body) ||
        (Array.isArray(body[field]) && body[field].every((item) => typeof item === "string")));
  }
  return Array.isArray(body.results) && body.results.every((item) => {
    const row = asRecord(item);
    if (row === null || typeof row.url !== "string") return false;
    // Search rows carry content; extract and crawl rows carry raw_content or content.
    const text = path === "search" ? typeof row.content === "string" : typeof row.raw_content === "string" || typeof row.content === "string";
    return text &&
      ["title", "content", "raw_content"].every((field) => !(field in row) || typeof row[field] === "string");
  });
}

function estimateCredits(path: string, body: Record<string, unknown>): number {
  if (path === "search") return body.search_depth === "advanced" ? 2 : 1;
  if (path === "extract") return TAVILY_WORST.extract(Array.isArray(body.urls) ? body.urls.length : 1);
  if (path === "map") return TAVILY_WORST.map;
  return TAVILY_WORST.crawl;
}

export function createRdap(fetchImpl: typeof fetch = fetch): RdapProvider {
  return {
    async lookup(domain: string): Promise<RdapResult> {
      if (blockedFetchReason("rdap", domain)) return { domain, ageDays: null, error: "blocked_url" };
      if (!/^[a-z0-9.-]+$/i.test(domain)) return { domain, ageDays: null, error: "bad_domain" };
      try {
        const base = rdapBaseUrl();
        const res = await fetchPublic(`${base}/domain/${encodeURIComponent(domain)}`, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) }, {
          fetchImpl,
          trustedHosts: trustedHost(base),
        });
        if (!res.ok) return { domain, ageDays: null, error: `http_${res.status}` };
        const json = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }>; registrar?: { name?: string } | string };
        const registration = json.events?.find((event) => event.eventAction === "registration");
        const created = registration?.eventDate;
        const ageDays = created ? Math.max(0, Math.round((Date.now() - Date.parse(created)) / 86_400_000)) : null;
        const registrar = typeof json.registrar === "string" ? json.registrar : json.registrar?.name;
        return { domain, ageDays, created, registrar };
      } catch (error) {
        return { domain, ageDays: null, error: error instanceof Error ? error.message : "rdap_failed" };
      }
    },
  };
}

export function createNebius(apiKey: string, fetchImpl: typeof fetch = fetch): LlmProvider {
  return {
    live: true,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      // One request per call. The reservation covers one call, and any sent request may be billed,
      // so there is no fallback model after an HTTP error or a network failure.
      const model = request.model;
      const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
      try {
        const content = request.imageDataUrl
          ? [
              { type: "text", text: request.user },
              { type: "image_url", image_url: { url: request.imageDataUrl } },
            ]
          : request.user;
        const base = nebiusBaseUrl();
        const res = await fetchPublic(`${base}chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: request.system },
              { role: "user", content },
            ],
          }),
          signal,
        }, { fetchImpl, trustedHosts: trustedHost(base), followRedirects: false });
        if (!res.ok) return failedModel(model, `http_${res.status}`);
        const json = (await res.json()) as {
          error?: unknown;
          choices?: Array<{ message?: { content?: unknown } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        // Only a real, nonempty choices array is a completion; anything else keeps the full reservation.
        const text = Array.isArray(json?.choices) && json.choices.length > 0 ? json.choices[0]?.message?.content : undefined;
        // A 200 without completion text may still be billed, so it fails and keeps the full reservation.
        const parsed = typeof text === "string" ? parseJson(text) : null;
        if (json?.error !== undefined || typeof text !== "string" || !asRecord(parsed)) return failedModel(model, "model_response");
        const promptTokens = json.usage?.prompt_tokens;
        const completionTokens = json.usage?.completion_tokens;
        // Negative, fractional, NaN or missing counts are not trusted: the meter charges the full reservation.
        // A prompt or text with zero reported tokens cannot be right, so it is treated as missing usage too.
        const usageOmitted = !validTokenCount(promptTokens) || !validTokenCount(completionTokens) || completionTokens === 0 || promptTokens === 0;
        return {
          text,
          json: parsed,
          model,
          tokens: {
            in: validTokenCount(promptTokens) ? promptTokens : Math.ceil(request.user.length / 4),
            out: validTokenCount(completionTokens) ? completionTokens : Math.ceil(text.length / 4),
          },
          ...(usageOmitted ? { usageOmitted } : {}),
        };
      } catch {
        return failedModel(model, "model_network");
      }
    },
  };
}

function failedModel(model: string, error: string): LlmResponse {
  return { text: "", json: null, model, tokens: { in: 0, out: 0 }, error };
}

function validTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function createScreenshotClient(options: { workerUrl?: string; secret?: string; fetchImpl?: typeof fetch }): ScreenshotProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async capture(url: string) {
      if (!options.workerUrl || !options.secret) return { skipped: true, error: "screenshot_worker_unconfigured" };
      try {
        await resolvePublicHttpUrl(url);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "blocked_url" };
      }
      const ts = Date.now().toString();
      const signature = signPayload({ url, ts }, options.secret);
      try {
        const res = await fetchPublic(options.workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-scout-signature": signature },
          body: JSON.stringify({ url, ts }),
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        }, { fetchImpl, trustedHosts: trustedHost(options.workerUrl) });
        if (!res.ok) return { error: `worker_${res.status}` };
        const json = (await res.json()) as { imageDataUrl?: string; error?: string };
        return json;
      } catch (error) {
        return { error: error instanceof Error ? error.message : "worker_failed" };
      }
    },
  };
}

export function tokenUsd(model: string, tokens: { in: number; out: number }): number {
  const price = TOKEN_PRICES[model] ?? TOKEN_PRICES[MODELS.extract] ?? [0.3, 0.9];
  return (tokens.in / 1_000_000) * price[0] + (tokens.out / 1_000_000) * price[1];
}
