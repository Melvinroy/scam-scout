import type { LlmProvider, LlmResponse, ResearchProvider } from "@/lib/providers/types";
import { runtimeEnv } from "@/lib/config";
import { promptTokenBound } from "@/lib/safety/spend";
import { TAVILY_WORST } from "@/lib/safety/tavily-cost";

/**
 * Hard per-check budget, enforced before every provider call. Defaults are the measured worst
 * case for one website check plus a small margin: 11 Tavily calls and 14 credits on the
 * heaviest recording, about 8,000 model tokens (prompts plus every max_tokens), plus one
 * screenshot at the vision model's full image bound (about 13,400 tokens).
 */
export const CHECK_CAP_DEFAULTS = { tavilyCalls: 12, tavilyCredits: 15, tokens: 24_000 };

export interface CheckCapLimits {
  tavilyCalls: number;
  tavilyCredits: number;
  tokens: number;
}

/** A blank name uses the default. A value that is not a whole number, or is above twice the default, closes the check. */
export function checkCapLimits(env: NodeJS.ProcessEnv = runtimeEnv()): CheckCapLimits {
  const read = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 && n <= fallback * 2 ? n : 0;
  };
  return {
    tavilyCalls: read("CHECK_MAX_TAVILY_CALLS", CHECK_CAP_DEFAULTS.tavilyCalls),
    tavilyCredits: read("CHECK_MAX_TAVILY_CREDITS", CHECK_CAP_DEFAULTS.tavilyCredits),
    tokens: read("CHECK_MAX_TOKENS", CHECK_CAP_DEFAULTS.tokens),
  };
}

/** Running totals for one check. Shared by the research and model wrappers of that check. */
export class CheckCap {
  calls = 0;
  credits = 0;
  tokens = 0;
  constructor(readonly limits: CheckCapLimits) {}

  /** Takes a call slot and the estimated credits, or refuses. Counted before the network call. */
  takeTavily(estimate: number): boolean {
    if (this.calls >= this.limits.tavilyCalls || this.credits + estimate > this.limits.tavilyCredits) return false;
    this.calls += 1;
    this.credits += estimate;
    return true;
  }

  /** Swaps the worst-case hold for the returned count. A missing or larger count spends the rest. */
  settleTavily(held: number, actual: number, omitted?: boolean): void {
    const bad = omitted || !Number.isFinite(actual) || actual < 0 || actual > held;
    this.credits = bad ? this.limits.tavilyCredits : this.credits - held + actual;
  }
}

const MIN_COMPLETION = 64;

export function capResearch(inner: ResearchProvider, cap: CheckCap): ResearchProvider {
  return {
    async search(request) {
      if (request.depth !== "basic") return { results: [], credits: 0, error: "check_depth" };
      const hold = TAVILY_WORST.search(request.depth);
      if (!cap.takeTavily(hold)) return { results: [], credits: 0, error: "check_budget" };
      const result = await inner.search(request);
      cap.settleTavily(hold, result.credits, result.usageOmitted);
      return result;
    },
    async extract(urls, query) {
      const estimate = TAVILY_WORST.extract(urls.length);
      if (!cap.takeTavily(estimate)) return { pages: [], failed: urls, credits: 0, error: "check_budget" };
      const result = await inner.extract(urls, query);
      cap.settleTavily(estimate, result.credits, result.usageOmitted);
      return result;
    },
    async map(url) {
      if (!cap.takeTavily(TAVILY_WORST.map)) return { urls: [], credits: 0, error: "check_budget" };
      const result = await inner.map(url);
      cap.settleTavily(TAVILY_WORST.map, result.credits, result.usageOmitted);
      return result;
    },
    async crawl(url, instructions) {
      if (!cap.takeTavily(TAVILY_WORST.crawl)) return { pages: [], credits: 0, error: "check_budget" };
      const result = await inner.crawl(url, instructions);
      cap.settleTavily(TAVILY_WORST.crawl, result.credits, result.usageOmitted);
      return result;
    },
  };
}

export function capLlm(inner: LlmProvider, cap: CheckCap): LlmProvider {
  return {
    live: inner.live,
    async complete(request) {
      const prompt = promptTokenBound(request);
      const room = cap.limits.tokens - cap.tokens - prompt;
      if (room < MIN_COMPLETION) return refused(request.model);
      const maxTokens = Math.min(request.maxTokens, room);
      // Held up front so parallel calls cannot share the same room.
      cap.tokens += prompt + maxTokens;
      const result = await inner.complete({ ...request, maxTokens });
      const used = result.tokens.in + result.tokens.out;
      if (!result.usageOmitted && !result.error && Number.isFinite(used) && used >= 0) {
        cap.tokens = cap.tokens - prompt - maxTokens + Math.max(used, 0);
      }
      return result;
    },
  };
}

function refused(model: string): LlmResponse {
  return { json: null, text: "", model, tokens: { in: 0, out: 0 }, error: "check_budget" };
}
