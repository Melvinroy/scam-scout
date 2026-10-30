import "./helpers/public-dns";
import { describe, expect, it } from "vitest";
import { authorizeLive, type QuotaLimits } from "@/lib/abuse/gate";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { MAX_COMPLETION_TOKENS, DOCUMENTED_LIMITS, evaluateSpend, spendLimits, UpstashSpendLedger, resetSpendState, spendLedgerBroken } from "@/lib/safety/spend";
import { evalLua, type RedisStrings } from "./helpers/redis-lua";
import { meterLlm, meterResearch } from "@/lib/safety/spend-meter";
import { TAVILY_WORST } from "@/lib/safety/tavily-cost";
import { CHECK_CAP_DEFAULTS, CheckCap, capLlm, capResearch, checkCapLimits } from "@/lib/safety/check-cap";
import { imageTokenBound } from "@/lib/safety/image-bound";
import { MODELS } from "@/lib/config";
import { FIXTURES } from "@/fixtures/cases";
import { fixtureDeps } from "@/lib/providers/runtime";
import { runInvestigation } from "@/lib/agent/machine";
import type { LlmProvider, ResearchProvider } from "@/lib/providers/types";
import { createNebius, createTavilyResearch } from "@/lib/providers/live";

/** A tiny Upstash stand-in. EVAL runs the same decision in one step, as the Lua script does in Redis. */
function fakeUpstash() {
  const strings: RedisStrings = new Map();
  const keys = {
    get: (key: string) => (strings.has(key) ? Number(strings.get(key)) : undefined),
    set: (key: string, value: number) => strings.set(key, String(value)),
    has: (key: string) => strings.has(key),
  };
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const args = JSON.parse(String(init?.body)) as unknown[];
    const command = String(args[0]);
    if (command === "EVAL") {
      // The production Lua, run in a Lua VM.
      const count = Number(args[2]);
      const named = args.slice(3, 3 + count).map(String);
      const argv = args.slice(3 + count) as Array<string | number>;
      return Response.json({ result: evalLua(strings, String(args[1]), named, argv) });
    }
    if (command === "GET") return Response.json({ result: strings.get(String(args[1])) ?? null });
    if (command === "INCRBYFLOAT" || command === "INCRBY" || command === "SET") {
      return Response.json({ result: evalLua(strings, `return redis.call('${command}', KEYS[1], ARGV[1])`, [String(args[1])], [args[2] as string]) });
    }
    return Response.json({ error: "unsupported" }, { status: 500 });
  }) as typeof fetch;
  return { keys, fetchImpl, ledger: new UpstashSpendLedger("https://example.upstash.io", "token", fetchImpl) };
}

const blankEnv = { SPEND_HARD_LIMIT_USD: "13.50", TAVILY_CREDIT_HARD_LIMIT: "400", TAVILY_DAILY_CREDIT_LIMIT: undefined } as unknown as NodeJS.ProcessEnv;

describe("lifetime hosted spend caps", () => {
  it("reads the documented 13.50 USD and 400 credits, and refuses live checks when either is blank or invalid", async () => {
    const limits = spendLimits(blankEnv, new Date("2026-10-30T08:00:00Z"));
    expect(limits).toMatchObject({ usd: DOCUMENTED_LIMITS.usd, tavilyCredits: DOCUMENTED_LIMITS.tavilyCredits });
    expect(limits.tavilyCreditsToday).toBeUndefined();
    for (const broken of [{}, { SPEND_HARD_LIMIT_USD: "13.50" }, { TAVILY_CREDIT_HARD_LIMIT: "400" }, { SPEND_HARD_LIMIT_USD: " ", TAVILY_CREDIT_HARD_LIMIT: "400" }, { SPEND_HARD_LIMIT_USD: "lots", TAVILY_CREDIT_HARD_LIMIT: "400" }]) {
      expect(() => spendLimits(broken as NodeJS.ProcessEnv)).toThrow(/spend_limit_config/);
    }
    resetSpendState();
    const { ledger } = fakeUpstash();
    const saved = process.env.SPEND_HARD_LIMIT_USD;
    delete process.env.SPEND_HARD_LIMIT_USD;
    try {
      expect((await evaluateSpend(ledger)).open).toBe(false);
    } finally {
      process.env.SPEND_HARD_LIMIT_USD = saved;
      resetSpendState();
    }
  });

  it("never reopens the model cap in a new month", async () => {
    resetSpendState();
    const { ledger } = fakeUpstash();
    const october = spendLimits(blankEnv, new Date("2026-10-30T08:00:00Z"));
    expect(await ledger.reserve({ usd: 13.4, tavilyCredits: 0 }, october)).toEqual({ ok: true });
    expect(await ledger.reserve({ usd: 0.2, tavilyCredits: 0 }, october)).toEqual({ ok: false, reason: "spend_limit" });
    const november = spendLimits(blankEnv, new Date("2026-11-01T00:00:00Z"));
    expect(await ledger.reserve({ usd: 0.2, tavilyCredits: 0 }, november)).toEqual({ ok: false, reason: "spend_limit" });
    const nextYear = spendLimits(blankEnv, new Date("2027-03-01T00:00:00Z"));
    expect(await ledger.reserve({ usd: 0.2, tavilyCredits: 0 }, nextYear)).toEqual({ ok: false, reason: "spend_limit" });
  });

  it("carries spend recorded under the older keys into the lifetime totals, once", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    keys.set("spend:usd", 13.5);
    keys.set("spend:tavily:2026-09", 150);
    keys.set("spend:tavily:2026-10", 250);
    const limits = spendLimits(blankEnv, new Date("2026-10-30T08:00:00Z"));
    expect(await ledger.read()).toMatchObject({ usd: 13.5, tavilyCredits: 400 });
    expect(await ledger.reserve({ usd: 0, tavilyCredits: 1 }, limits)).toEqual({ ok: false, reason: "spend_limit" });
    resetSpendState();
    const again = fakeUpstash();
    again.keys.set("spend:usd:2026-10", 2);
    again.keys.set("spend:tavily:2026-10", 10);
    const fresh = new UpstashSpendLedger("https://example.upstash.io", "token", again.fetchImpl);
    await fresh.read();
    await fresh.read();
    expect(again.keys.get("spend:usd")).toBe(2);
    expect(again.keys.get("spend:tavily:total")).toBe(10);
  });

  it("stops Tavily at 400 credits in total, across days and months", async () => {
    resetSpendState();
    const { ledger } = fakeUpstash();
    const day1 = spendLimits(blankEnv, new Date("2026-10-30T08:00:00Z"));
    expect(await ledger.reserve({ usd: 0, tavilyCredits: 390 }, day1)).toEqual({ ok: true });
    const later = spendLimits(blankEnv, new Date("2026-12-02T08:00:00Z"));
    expect(await ledger.reserve({ usd: 0, tavilyCredits: 15 }, later)).toEqual({ ok: false, reason: "spend_limit" });
    expect(await ledger.reserve({ usd: 0, tavilyCredits: 9 }, later)).toEqual({ ok: true });
  });

  it("never lets concurrent reservations push the total past either cap", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    const limits = spendLimits(blankEnv, new Date("2026-10-30T08:00:00Z"));
    const results = await Promise.all(Array.from({ length: 60 }, () => ledger.reserve({ usd: 0.5, tavilyCredits: 15 }, limits)));
    expect(results.filter((result) => result.ok)).toHaveLength(26);
    expect(keys.get("spend:usd")).toBeLessThan(13.5);
    expect(keys.get("spend:tavily:total")).toBeLessThan(400);
  });

  it("holds the worst case for each call, so concurrent crawls near the cap never settle past it", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    keys.set("spend:migrated:lifetime", 1);
    keys.set("spend:tavily:total", 395);
    let ran = 0;
    const crawler = {
      search: async () => ({ results: [], credits: 1 }),
      extract: async () => ({ pages: [], failed: [], credits: 1 }),
      map: async () => ({ urls: [], credits: 4 }),
      crawl: async () => { ran += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { pages: [], credits: 4 }; },
    };
    const metered = meterResearch(crawler, ledger);
    const results = await Promise.all(Array.from({ length: 4 }, () => metered.crawl("https://example.com", "x")));
    expect(ran).toBe(1);
    expect(results.filter((result) => result.error === "spend_limit")).toHaveLength(3);
    expect(keys.get("spend:tavily:total")).toBeLessThanOrEqual(400);
    expect(TAVILY_WORST.crawl).toBeGreaterThanOrEqual(4);
    expect(TAVILY_WORST.map).toBeGreaterThanOrEqual(4);
    expect(TAVILY_WORST.extract(6)).toBe(2);
  });

  it("closes the ledger when a provider reports more than the held worst case", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    keys.set("spend:migrated:lifetime", 1);
    keys.set("spend:tavily:total", 390);
    const over = meterResearch({
      search: async () => ({ results: [], credits: 9 }),
      extract: async () => ({ pages: [], failed: [], credits: 1 }),
      map: async () => ({ urls: [], credits: 1 }),
      crawl: async () => ({ pages: [], credits: 1 }),
    }, ledger);
    await over.search({ action: "search_reports", query: "x", depth: "basic", maxResults: 3 });
    expect(spendLedgerBroken()).toBe(true);
    expect((await over.search({ action: "search_reports", query: "y", depth: "basic", maxResults: 3 })).error).toBeTruthy();
    resetSpendState();
  });
});

describe("daily live checks across all users", () => {
  const limits: QuotaLimits = { accountAllowance: 3, ipDailyCap: 8, deviceDailyCap: 8, ratePerHour: 5, dailyCreditCap: 400, creditsPerLiveCase: 16, globalDailyCap: 4 };
  const run = (store: MemoryUsageStore, n: number, now = new Date("2026-10-30T08:00:00Z")) =>
    authorizeLive({ userId: `user_${n}`, human: true, keysConfigured: true, ip: `203.0.113.${n}`, deviceId: `device-${n}`, userAgent: "UA", store, limits, now, publicQuota: true });

  it("plays recordings once the shared daily limit is used, even under concurrent requests", async () => {
    const store = new MemoryUsageStore();
    const decisions = await Promise.all(Array.from({ length: 12 }, (_, n) => run(store, n)));
    expect(decisions.filter((decision) => decision.mode === "live")).toHaveLength(4);
    expect(decisions.filter((decision) => decision.mode === "replay").every((decision) => decision.reason === "global_daily_cap")).toBe(true);
    expect((await run(store, 50, new Date("2026-10-31T00:00:01Z"))).mode).toBe("live");
  });
});

describe("per-check hard budget", () => {
  const hits = () => ({ results: [], credits: 1 });
  function counting() {
    const seen: string[] = [];
    const inner = {
      search: async (request: { depth: string }) => { seen.push(`search:${request.depth}`); return hits(); },
      extract: async () => { seen.push("extract"); return { pages: [], failed: [], credits: 1 }; },
      map: async () => { seen.push("map"); return { urls: [], credits: 1 }; },
      crawl: async () => { seen.push("crawl"); return { pages: [], credits: 2 }; },
    } as unknown as ResearchProvider;
    return { seen, inner };
  }
  const search = { action: "search_reports" as const, query: "q", depth: "basic" as const, maxResults: 3 };

  it("uses the measured defaults and closes on a bad setting", () => {
    expect(checkCapLimits({} as NodeJS.ProcessEnv)).toEqual({ tavilyCalls: 12, tavilyCredits: 15, tokens: 24_000 });
    expect(CHECK_CAP_DEFAULTS.tokens).toBeGreaterThanOrEqual(8_000 + imageTokenBound(png(1, 1), MODELS.vision)! + MAX_COMPLETION_TOKENS);
    expect(checkCapLimits({ CHECK_MAX_TAVILY_CALLS: "lots", CHECK_MAX_TOKENS: "-1" } as unknown as NodeJS.ProcessEnv)).toMatchObject({ tavilyCalls: 0, tokens: 0 });
  });

  it("refuses the call after the cap without reaching Tavily", async () => {
    const { seen, inner } = counting();
    const capped = capResearch(inner, new CheckCap({ tavilyCalls: 5, tavilyCredits: 15, tokens: 1000 }));
    for (let i = 0; i < 5; i += 1) expect((await capped.search(search)).error).toBeUndefined();
    expect((await capped.search(search)).error).toBe("check_budget");
    expect(seen).toHaveLength(5);
    const defaults = capResearch(counting().inner, new CheckCap(checkCapLimits({} as NodeJS.ProcessEnv)));
    const results = [];
    for (let i = 0; i < 13; i += 1) results.push(await defaults.search(search));
    expect(results.filter((result) => result.error === "check_budget")).toHaveLength(1);
  });

  it("refuses advanced depth, and the credit ceiling also stops extract and crawl", async () => {
    const { seen, inner } = counting();
    const capped = capResearch(inner, new CheckCap({ tavilyCalls: 12, tavilyCredits: 5, tokens: 1000 }));
    expect((await capped.search({ ...search, depth: "advanced" })).error).toBe("check_depth");
    expect(seen).toEqual([]);
    expect((await capped.crawl("https://example.com", "x")).error).toBeUndefined();
    expect((await capped.extract(["https://example.com"], "x")).error).toBeUndefined();
    expect((await capped.map("https://example.com")).error).toBe("check_budget");
    expect(seen).toEqual(["crawl", "extract"]);
  });

  it("trims max_tokens to the room left, then refuses the model call", async () => {
    const asked: number[] = [];
    const llm = capLlm({ live: true, complete: async (request) => { asked.push(request.maxTokens); return { json: null, text: "", model: request.model, tokens: { in: 30, out: request.maxTokens } }; } }, new CheckCap({ tavilyCalls: 0, tavilyCredits: 0, tokens: 764 }));
    const ask = { task: "memo" as const, model: "m", system: "", user: "x".repeat(90), maxTokens: 500, temperature: 0 };
    await llm.complete(ask);
    await llm.complete(ask);
    expect((await llm.complete(ask)).error).toBe("check_budget");
    expect(asked).toEqual([500, 80]);
  });

  it("finishes a check from the evidence it has when the caps are hit", async () => {
    const fixture = FIXTURES.find((item) => item.id === "quantum-yield")!;
    const deps = fixtureDeps(fixture);
    const cap = new CheckCap({ tavilyCalls: 3, tavilyCredits: 3, tokens: 400 });
    const depths: string[] = [];
    const research = deps.research;
    deps.research = capResearch({ ...research, search: async (request) => { depths.push(request.depth); return research.search(request); } }, cap);
    const model = deps.llm;
    const asked: number[] = [];
    deps.llm = capLlm({ live: true, complete: async (request) => { asked.push(request.maxTokens); return model.complete(request); } }, cap);
    const run = runInvestigation({ raw: `https://${fixture.domain}/`, mode: "live", deps });
    let step = await run.next();
    while (!step.done) step = await run.next();
    expect(cap.calls).toBe(3);
    // The recorded model reports more tokens than a real one could, so later calls are refused.
    expect(asked.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(400);
    expect(asked.length).toBeLessThan(6);
    expect(depths.every((depth) => depth === "basic")).toBe(true);
    expect(step.value.verdict.level).toBeTruthy();
    expect(step.value.verdict.unverified || step.value.evidence.length > 0).toBe(true);
  });

  it("never runs advanced searches on a full check", async () => {
    const fixture = FIXTURES.find((item) => item.id === "quantum-yield")!;
    const deps = fixtureDeps(fixture);
    const depths: string[] = [];
    const research = deps.research;
    deps.research = { ...research, search: async (request) => { depths.push(request.depth); return research.search(request); } };
    const run = runInvestigation({ raw: `https://${fixture.domain}/`, mode: "live", deps });
    let step = await run.next();
    while (!step.done) step = await run.next();
    expect(depths).not.toContain("advanced");
  });

  it("stops on the lifetime cap even with per-check room, and a per-check refusal reserves nothing", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    keys.set("spend:tavily:total", 399);
    const { seen, inner } = counting();
    const research = capResearch(meterResearch(inner, ledger), new CheckCap({ tavilyCalls: 12, tavilyCredits: 15, tokens: 1000 }));
    expect((await research.search(search)).error).toBe("spend_limit");
    expect(seen).toEqual([]);
    keys.set("spend:tavily:total", 0);
    expect((await research.search({ ...search, depth: "advanced" })).error).toBe("check_depth");
    expect(keys.get("spend:tavily:total")).toBe(0);
    resetSpendState();
  });
});

describe("model spend reservations and invalid usage", () => {
  const ask = { task: "memo" as const, model: "nvidia/Nemotron-3-Ultra-550b-a55b", system: "s", user: "x".repeat(2000), maxTokens: 4000, temperature: 0 };

  it("detects impossible over-reporting, closes the ledger, and distinguishes reported billing from clipped accounting", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    keys.set("spend:migrated:lifetime", 1);
    keys.set("spend:usd", 13.47);
    // Deliberately impossible usage: this checks detection, not a real spending bound.
    let providerBilled = 13.47;
    let calls = 0;
    const greedy: LlmProvider = { live: true, complete: async (request) => { calls += 1; providerBilled += (900_000 * 1 + 900_000 * 3) / 1_000_000; await new Promise((resolve) => setTimeout(resolve, 5)); return { text: "{}", json: {}, model: request.model, tokens: { in: 900_000, out: 900_000 } }; } };
    const metered = meterLlm(greedy, ledger);
    await Promise.all(Array.from({ length: 4 }, () => metered.complete(ask)));
    expect(Number(keys.get("spend:usd"))).toBeLessThanOrEqual(DOCUMENTED_LIMITS.usd);
    expect(providerBilled).toBeCloseTo(13.47 + calls * 3.6, 10);
    expect(providerBilled).toBeGreaterThan(DOCUMENTED_LIMITS.usd);
    expect(spendLedgerBroken()).toBe(true);
    const callsAtClosure = calls;
    expect((await metered.complete(ask)).error).toBeTruthy();
    expect(calls).toBe(callsAtClosure);
    expect(await ledger.reserve({ usd: 0.001, tavilyCredits: 0 }, spendLimits(blankEnv))).toMatchObject({ ok: false });
    resetSpendState();
  });

  it("keeps the full reservation when a 200 response has no completion text", async () => {
    const zero = { prompt_tokens: 0, completion_tokens: 0 };
    for (const body of [{ usage: zero }, { error: { message: "x" }, usage: zero }, { choices: [], usage: zero }, { choices: [{ message: { content: 7 } }], usage: zero }, { choices: [{ message: { content: "" } }], usage: zero }, { choices: [{ message: { content: "  " } }], usage: zero }, { choices: [{ message: { content: "not json" } }], usage: zero }, { choices: [{ message: { content: "[]" } }], usage: zero }, { choices: [{ message: { content: "true" } }], usage: zero }, { choices: { 0: { message: { content: "{}" } } }, usage: zero }]) {
      resetSpendState();
      const { keys, ledger } = fakeUpstash();
      keys.set("spend:migrated:lifetime", 1);
      const nebius = createNebius("nvapi-mock", (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
      const result = await meterLlm(nebius, ledger).complete(ask);
      expect(result.error).toBe("model_response");
      expect(Number(keys.get("spend:usd"))).toBeCloseTo((2065 + 1500 * 3) / 1_000_000, 12);
    }
    resetSpendState();
  });

  it("charges the full reservation for negative, NaN, fractional or missing token counts", async () => {
    for (const usage of [{ prompt_tokens: -5, completion_tokens: 10 }, { prompt_tokens: 10, completion_tokens: Number.NaN }, { prompt_tokens: 1.5, completion_tokens: 2 }, { prompt_tokens: 10 }, { prompt_tokens: 0, completion_tokens: 0 }, { prompt_tokens: 0, completion_tokens: 1 }, undefined]) {
      resetSpendState();
      const { keys, ledger } = fakeUpstash();
      keys.set("spend:migrated:lifetime", 1);
      const nebius = createNebius("nvapi-mock", (async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage }), { status: 200 })) as typeof fetch);
      const metered = meterLlm(nebius, ledger);
      await metered.complete(ask);
      expect(Number(keys.get("spend:usd"))).toBeCloseTo((2065 + 1500 * 3) / 1_000_000, 12);
      expect(spendLedgerBroken()).toBe(true);
    }
    resetSpendState();
  });
});

describe("cap settings above the documented maximum", () => {
  it("refuse live checks instead of raising the ceiling", () => {
    const env = (usd: string, credits: string) => ({ SPEND_HARD_LIMIT_USD: usd, TAVILY_CREDIT_HARD_LIMIT: credits }) as unknown as NodeJS.ProcessEnv;
    expect(() => spendLimits(env("99", "400"))).toThrow(/spend_limit_config/);
    expect(() => spendLimits(env("13.51", "400"))).toThrow(/spend_limit_config/);
    expect(() => spendLimits(env("13.50", "401"))).toThrow(/spend_limit_config/);
    expect(() => spendLimits(env("Infinity", "400"))).toThrow(/spend_limit_config/);
    expect(spendLimits(env("13.50", "400"))).toMatchObject({ usd: 13.5, tavilyCredits: 400 });
    expect(spendLimits(env("2", "50"))).toMatchObject({ usd: 2, tavilyCredits: 50 });
  });
});

describe("other limit settings", () => {
  it("refuse values that are not whole numbers or are out of range, instead of weakening a limit", async () => {
    const { quotaDefaults, LimitConfigError } = await import("@/lib/config");
    const env = (patch: Record<string, string>) => patch as unknown as NodeJS.ProcessEnv;
    expect(quotaDefaults(env({})).ratePerHour).toBe(5);
    expect(() => quotaDefaults(env({ RATE_LIMIT_PER_HOUR: "1000000000000" }))).toThrow(LimitConfigError);
    expect(() => quotaDefaults(env({ GLOBAL_LIVE_DAILY_CAP: "-1" }))).toThrow(LimitConfigError);
    expect(() => quotaDefaults(env({ IP_DAILY_CAP: "2.5" }))).toThrow(LimitConfigError);
    expect(() => quotaDefaults(env({ DAILY_CREDIT_CAP: "401" }))).toThrow(LimitConfigError);
    expect(quotaDefaults(env({ GLOBAL_LIVE_DAILY_CAP: "0", RATE_LIMIT_PER_HOUR: "2" }))).toMatchObject({ globalDailyCap: 0, ratePerHour: 2 });
    expect(checkCapLimits(env({ CHECK_MAX_TAVILY_CALLS: "1000", CHECK_MAX_TOKENS: "1.5" }))).toMatchObject({ tavilyCalls: 0, tokens: 0 });
    expect(checkCapLimits(env({ CHECK_MAX_TAVILY_CALLS: "20" })).tavilyCalls).toBe(20);
    const { reportRetentionMs } = await import("@/lib/config");
    expect(() => reportRetentionMs(env({ REPORT_RETENTION_DAYS: "100000" }))).toThrow(LimitConfigError);
    expect(reportRetentionMs(env({}))).toBe(14 * 86_400_000);
    const caps = { SPEND_HARD_LIMIT_USD: "13.50", TAVILY_CREDIT_HARD_LIMIT: "400" };
    expect(() => spendLimits(env({ ...caps, TAVILY_DAILY_CREDIT_LIMIT: "50.5" }))).toThrow(/spend_limit_config/);
    expect(() => spendLimits(env({ ...caps, TAVILY_DAILY_CREDIT_LIMIT: "401" }))).toThrow(/spend_limit_config/);
  });
});

function png(width: number, height: number): string {
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

describe("worst case reserved before any model call", () => {
  it("refuses images outside the size bounds and clamps max_tokens before the reserve", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    keys.set("spend:migrated:lifetime", 1);
    const sent: number[] = [];
    const inner: LlmProvider = { live: true, complete: async (request) => { sent.push(request.maxTokens); return { text: "{}", json: {}, model: request.model, tokens: { in: 1, out: 1 } }; } };
    const metered = meterLlm(inner, ledger);
    const vision = { task: "vision" as const, model: "nvidia/Nemotron-3.5-Super-VL", system: "s", user: "u", maxTokens: 800, temperature: 0 };
    for (const image of [png(4000, 100), png(1300, 1300), "data:image/gif;base64,R0lGODlh", "data:image/png;base64,AAAA"]) {
      expect((await metered.complete({ ...vision, imageDataUrl: image })).error).toBe("spend_limit");
    }
    expect(sent).toEqual([]);
    await metered.complete({ ...vision, maxTokens: 1_000_000, imageDataUrl: png(1200, 1200) });
    expect(sent).toEqual([MAX_COMPLETION_TOKENS]);
    resetSpendState();
  });

  it("bounds independently billed parallel vision calls at legitimate request maxima", async () => {
    for (const parallel of [2, 5, 20, 60]) {
      resetSpendState();
      const { keys, ledger } = fakeUpstash();
      keys.set("spend:migrated:lifetime", 1);
      keys.set("spend:usd", 13.45);
      let ran = 0;
      let providerBilled = 13.45;
      const provider: LlmProvider = { live: true, complete: async (request) => {
        ran += 1;
        expect(request.maxTokens).toBe(1500);
        // NVIDIA processor fixture: 1200 square -> 76x76 grid / 4 = 1444 visual tokens.
        // Include 64 chat tokens and 64 image framing tokens conservatively.
        const tokens = { in: 9572, out: 1500 };
        providerBilled += (tokens.in * 0.3 + tokens.out * 0.9) / 1_000_000;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { text: "{}", json: {}, model: request.model, tokens };
      } };
      const metered = meterLlm(provider, ledger);
      const ask = { task: "vision" as const, model: "nvidia/Nemotron-3.5-Super-VL", system: "s".repeat(4000), user: "u".repeat(4000), maxTokens: 9_999, temperature: 0, imageDataUrl: png(1200, 1200) };
      await Promise.all(Array.from({ length: parallel }, () => metered.complete(ask)));
      expect(ran, `${parallel} parallel ran`).toBeGreaterThanOrEqual(2);
      expect(providerBilled).toBeGreaterThan(13.45);
      expect(providerBilled).toBeLessThanOrEqual(DOCUMENTED_LIMITS.usd);
      // Independent provider billing uses the VL tariff and processor fixture above.
      expect(providerBilled).toBeCloseTo(13.45 + ran * (9572 * 0.3 + 1500 * 0.9) / 1_000_000, 10);
      expect(Number(keys.get("spend:usd"))).toBeCloseTo(providerBilled, 10);
      expect(spendLedgerBroken()).toBe(false);
      // Settlement refunds unused reserve, so later requests may still fit.
      expect(Number(keys.get("spend:usd")), `${parallel} parallel`).toBeLessThanOrEqual(DOCUMENTED_LIMITS.usd);
    }
    resetSpendState();
  });

  it("keeps the held Tavily credits when a 200 response is an error or has no results", async () => {
    for (const body of [{ error: "upstream failure", usage: { credits: 0 } }, { detail: { error: "x" }, results: [], usage: { credits: 0 } }, { usage: { credits: 0 } }, { urls: [], usage: { credits: 0 } }, { results: ["x"], usage: { credits: 0 } }, { results: [{}], usage: { credits: 0 } }, { results: [{ url: "https://a.example" }], usage: { credits: 0 } }, null]) {
      resetSpendState();
      const { keys, ledger } = fakeUpstash();
      keys.set("spend:migrated:lifetime", 1);
      const tavily = createTavilyResearch("tvly-mock", (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch);
      await expect(meterResearch(tavily, ledger).search({ action: "search_reports", query: "x", depth: "basic", maxResults: 1 })).rejects.toThrow("malformed");
      expect(Number(keys.get("spend:tavily:total"))).toBe(1);
    }
    resetSpendState();
  });

  it("charges the held worst case for a fractional Tavily count instead of refunding it", async () => {
    resetSpendState();
    const { keys, ledger } = fakeUpstash();
    keys.set("spend:migrated:lifetime", 1);
    const nebiusFree = createTavilyResearch("tvly-mock", (async () => new Response(JSON.stringify({ results: [], usage: { credits: 0.1 } }), { status: 200 })) as typeof fetch);
    await meterResearch(nebiusFree, ledger).search({ action: "search_reports", query: "x", depth: "basic", maxResults: 1 });
    expect(Number(keys.get("spend:tavily:total"))).toBe(1);
    expect(spendLedgerBroken()).toBe(false);
    resetSpendState();
  });
});

for (const endpoint of ["search", "extract", "crawl", "map"] as const) {
  const fields = endpoint === "map" ? ["results", "urls"] : ["url", "title", "content", "raw_content"];
  for (const field of fields) for (const value of [7, {}, [], null]) {
    it(`retains the ${endpoint} hold for malformed ${field}: ${JSON.stringify(value)}`, async () => {
      resetSpendState();
      const { keys, ledger } = fakeUpstash();
      keys.set("spend:migrated:lifetime", 1);
      const body = endpoint === "map" ? { [field]: [value] } : { results: [{ url: "https://example.com", title: "Title", content: "Text", raw_content: "Text", [field]: value }] };
      let calls = 0;
      const provider = meterResearch(createTavilyResearch("tvly-mock", (async () => {
        calls++;
        return Response.json({ ...body, usage: { credits: 0 } });
      }) as typeof fetch), ledger);
      try {
        const result = endpoint === "search" ? provider.search({ action: "search_reports", query: "x", depth: "basic", maxResults: 1 })
          : endpoint === "extract" ? provider.extract(["https://example.com"], "x")
          : endpoint === "crawl" ? provider.crawl("https://example.com", "x") : provider.map("https://example.com");
        await expect(result).rejects.toThrow("malformed");
        expect(calls).toBe(1);
        expect(Number(keys.get("spend:tavily:total"))).toBe(endpoint === "map" || endpoint === "crawl" ? 4 : 1);
      } finally { resetSpendState(); }
    });
  }
}
