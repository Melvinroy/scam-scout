import "./helpers/public-dns";
import { describe, expect, it } from "vitest";
import { emptyCase } from "@/lib/case/reducer";
import type { LlmProvider, ResearchProvider } from "@/lib/providers/types";
import { liveDeps } from "@/lib/providers/runtime";
import { meterLlm, meterResearch } from "@/lib/safety/spend-meter";
import {
  SPEND_RESERVE_LUA,
  SPEND_MIGRATE_LUA,
  UnavailableSpendLedger,
  UpstashSpendLedger,
  decideSpendReserve,
  evaluateSpend,
  formatSpend,
  getSpendLedger,
  markSpendBroken,
  nebiusCallUsd,
  nebiusReserveUsd,
  promptTokenBound,
  resetSpendState,
  resolveCredits,
  setSpendLedger,
  spendLedgerBroken,
  spendLimits,
  SPEND_PAUSE_COPY,
  type SpendLedger,
  type SpendLimits,
  type SpendSnapshot,
} from "@/lib/safety/spend";
import { sheetFromView } from "@/lib/ui/live-sheet";

function withEnv(patch: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

class FakeLedger implements SpendLedger {
  snapshot: SpendSnapshot = { usd: 0, tavilyCredits: 0 };
  closed = false;

  async read(): Promise<SpendSnapshot> {
    return { ...this.snapshot };
  }

  async reserve(entry: SpendSnapshot, limits: SpendLimits) {
    const decision = decideSpendReserve(this.snapshot, entry, limits);
    if (!decision.ok) return decision;
    const next: SpendSnapshot = {
      usd: this.snapshot.usd + entry.usd,
      tavilyCredits: this.snapshot.tavilyCredits + entry.tavilyCredits,
    };
    if (this.snapshot.tavilyCreditsToday != null || limits.tavilyCreditsToday != null) {
      next.tavilyCreditsToday = (this.snapshot.tavilyCreditsToday ?? 0) + entry.tavilyCredits;
    }
    this.snapshot = next;
    return { ok: true as const };
  }

  async settle(reserved: SpendSnapshot, actual: SpendSnapshot) {
    const creditDelta = actual.tavilyCredits - reserved.tavilyCredits;
    const next: SpendSnapshot = {
      usd: this.snapshot.usd - reserved.usd + actual.usd,
      tavilyCredits: this.snapshot.tavilyCredits + creditDelta,
    };
    if (this.snapshot.tavilyCreditsToday != null) next.tavilyCreditsToday = this.snapshot.tavilyCreditsToday + creditDelta;
    this.snapshot = next;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function research(calls: string[], credits = 1): ResearchProvider {
  return {
    async search() {
      calls.push("search");
      return { results: [], credits };
    },
    async extract() {
      calls.push("extract");
      return { pages: [], failed: [], credits: 1 };
    },
    async map() {
      calls.push("map");
      return { urls: [], credits: 1 };
    },
    async crawl() {
      calls.push("crawl");
      return { pages: [], credits: 4 };
    },
  };
}

function model(calls: string[], name: string, tokens = { in: 1_000_000, out: 500_000 }): LlmProvider {
  return {
    live: true,
    async complete(request) {
      calls.push(request.model);
      return { text: "{}", json: {}, model: name, tokens };
    },
  };
}

describe("spend limits", () => {
  it("reads the configured lifetime caps, and refuses when either is blank", () => {
    const now = new Date("2026-10-31T23:30:00.000Z");
    const blank = {
      SPEND_HARD_LIMIT_USD: undefined,
      TAVILY_CREDIT_HARD_LIMIT: undefined,
      TAVILY_DAILY_CREDIT_LIMIT: undefined,
      VERCEL_ENV: undefined,
    };
    withEnv(blank, () => {
      expect(() => spendLimits(process.env, now)).toThrow(/spend_limit_config/);
    });
    withEnv({ ...blank, SPEND_HARD_LIMIT_USD: "13.50", TAVILY_CREDIT_HARD_LIMIT: "400" }, () => {
      expect(spendLimits(process.env, now)).toEqual({ usd: 13.5, tavilyCredits: 400, month: "2026-10", day: "2026-10-31" });
    });
    withEnv({ SPEND_HARD_LIMIT_USD: "nope", TAVILY_CREDIT_HARD_LIMIT: "-4", TAVILY_DAILY_CREDIT_LIMIT: "50" }, () => {
      expect(() => spendLimits()).toThrow(/spend_limit_config/);
    });
    withEnv({ SPEND_HARD_LIMIT_USD: "5", TAVILY_CREDIT_HARD_LIMIT: "200", TAVILY_DAILY_CREDIT_LIMIT: "nope" }, () => {
      expect(() => spendLimits()).toThrow(/spend_limit_config/);
    });
    withEnv({ ...blank, SPEND_HARD_LIMIT_USD: "0", TAVILY_CREDIT_HARD_LIMIT: "200.9", TAVILY_DAILY_CREDIT_LIMIT: "0" }, () => {
      expect(() => spendLimits(process.env, now)).toThrow(/spend_limit_config/);
    });
    withEnv({ ...blank, SPEND_HARD_LIMIT_USD: "0", TAVILY_CREDIT_HARD_LIMIT: "400.01" }, () => {
      expect(() => spendLimits(process.env, now)).toThrow(/spend_limit_config/);
    });
    withEnv({ ...blank, SPEND_HARD_LIMIT_USD: "0", TAVILY_CREDIT_HARD_LIMIT: "200", TAVILY_DAILY_CREDIT_LIMIT: "0" }, () => {
      expect(spendLimits(process.env, now)).toMatchObject({ usd: 0, tavilyCredits: 200, tavilyCreditsToday: 0 });
    });
  });

  it("refuses to start a live check when a configured limit is not a number", async () => {
    resetSpendState();
    const previousUsd = process.env.SPEND_HARD_LIMIT_USD;
    const previousCredits = process.env.TAVILY_CREDIT_HARD_LIMIT;
    process.env.SPEND_HARD_LIMIT_USD = "nope";
    process.env.TAVILY_CREDIT_HARD_LIMIT = "200";
    try {
      expect((await evaluateSpend(new FakeLedger())).reason).toBe("spend_unreadable");
      expect(spendLedgerBroken()).toBe(true);
    } finally {
      if (previousUsd === undefined) delete process.env.SPEND_HARD_LIMIT_USD;
      else process.env.SPEND_HARD_LIMIT_USD = previousUsd;
      if (previousCredits === undefined) delete process.env.TAVILY_CREDIT_HARD_LIMIT;
      else process.env.TAVILY_CREDIT_HARD_LIMIT = previousCredits;
      resetSpendState();
    }
  });

  it("refuses a reserve that would reach 5.00 and leaves the balance where it was", async () => {
    const limits = { usd: 5, tavilyCredits: 200 };
    const ledger = new FakeLedger();
    ledger.snapshot = { usd: 4.99, tavilyCredits: 199 };
    expect((await evaluateSpend(ledger, limits)).open).toBe(true);
    const refused = await ledger.reserve({ usd: 0.02, tavilyCredits: 0 }, limits);
    expect(refused).toEqual({ ok: false, reason: "spend_limit" });
    expect(await ledger.read()).toEqual({ usd: 4.99, tavilyCredits: 199 });
    ledger.snapshot = { usd: 5, tavilyCredits: 0 };
    expect((await evaluateSpend(ledger, limits)).reason).toBe("spend_limit");
  });

  it("prices a known model from config and an unknown model at the highest rate", () => {
    expect(nebiusCallUsd("nvidia/Nemotron-3_5-Lightning", { in: 1_000_000, out: 1_000_000 })).toBeCloseTo(0.3, 8);
    expect(() => nebiusCallUsd("not-a-listed-model", { in: 1_000_000, out: 0 })).toThrow("model_unpriced");
    expect(nebiusCallUsd("nvidia/Nemotron-3-Ultra-550b-a55b", { in: 0, out: 1_000_000 })).toBeCloseTo(3, 8);
  });

  it("treats a non-finite credit count as the upper bound, not as 2", () => {
    expect(resolveCredits(Number.NaN, 200)).toEqual({ credits: 200, invalid: true });
    expect(resolveCredits(-3, 200)).toEqual({ credits: 200, invalid: true });
    expect(resolveCredits(4, 200)).toEqual({ credits: 4, invalid: false });
  });

  it("closes on a limit and reports an unreadable ledger as its own reason", async () => {
    const limits = { usd: 1, tavilyCredits: 200 };
    const ledger = new FakeLedger();
    expect((await evaluateSpend(ledger, limits)).open).toBe(true);
    ledger.snapshot = { usd: 0.8, tavilyCredits: 199 };
    expect((await evaluateSpend(ledger, limits)).open).toBe(true);
    ledger.snapshot = { usd: 0.8, tavilyCredits: 200 };
    expect(await evaluateSpend(ledger, limits)).toMatchObject({ open: false, reason: "spend_limit", tavilyCredits: 200 });
    const down: SpendLedger = {
      async read() {
        throw new Error("down");
      },
      async reserve() {
        throw new Error("down");
      },
      async settle() {
        throw new Error("down");
      },
      async close() {
        throw new Error("down");
      },
    };
    expect((await evaluateSpend(down, limits)).reason).toBe("spend_unreadable");
    expect(SPEND_PAUSE_COPY).toBe("Live checks are temporarily unavailable. Showing a recorded case.");
    expect(formatSpend({ usd: 1.25, tavilyCredits: 200, tavilyCreditsToday: 12 }, { ...limits, tavilyCreditsToday: 50 })).toEqual({
      usd: "$1.2500 of $1.00",
      daily: "12 of 50 Tavily credits today",
      credits: "200 of 200 Tavily credits in total",
      paused: true,
    });
    expect(formatSpend({ usd: 0, tavilyCredits: 3, tavilyCreditsToday: 3 }, { usd: 13.5, tavilyCredits: 400 }).daily).toBe("3 Tavily credits today, no daily cap");
  });

  it("refuses the daily credit budget without moving the monthly total", async () => {
    resetSpendState();
    const limits = { usd: 5, tavilyCredits: 900, tavilyCreditsToday: 50, month: "2026-10", day: "2026-10-21" };
    const ledger = new FakeLedger();
    ledger.snapshot = { usd: 0, tavilyCredits: 10, tavilyCreditsToday: 49 };
    expect((await evaluateSpend(ledger, limits)).open).toBe(true);
    const refused = await ledger.reserve({ usd: 0, tavilyCredits: 2 }, limits);
    expect(refused).toEqual({ ok: false, reason: "daily_credit" });
    expect(await ledger.read()).toEqual({ usd: 0, tavilyCredits: 10, tavilyCreditsToday: 49 });
    ledger.snapshot = { usd: 0, tavilyCredits: 10, tavilyCreditsToday: 50 };
    expect(await evaluateSpend(ledger, limits)).toMatchObject({
      open: false,
      reason: "daily_credit",
      tavilyCredits: 10,
      tavilyCreditsToday: 50,
    });
    ledger.snapshot = { usd: 4.99, tavilyCredits: 899, tavilyCreditsToday: 49 };
    expect(await ledger.reserve({ usd: 0.02, tavilyCredits: 2 }, limits)).toEqual({ ok: false, reason: "spend_limit" });
    expect(await ledger.read()).toEqual({ usd: 4.99, tavilyCredits: 899, tavilyCreditsToday: 49 });
    expect(decideSpendReserve({ usd: 0, tavilyCredits: 0, tavilyCreditsToday: 0 }, { usd: 0, tavilyCredits: 1 }, { usd: 5, tavilyCredits: 200, tavilyCreditsToday: 0 })).toEqual({
      ok: false,
      reason: "daily_credit",
    });
    expect(decideSpendReserve({ usd: 0, tavilyCredits: 0 }, { usd: 0, tavilyCredits: 1 }, { usd: 5, tavilyCredits: 200 }).ok).toBe(true);
  });

  it("shows one neutral line on the case sheet for every pause", () => {
    const limited = { ...emptyCase(), mode: "done" as const, replay: true, replayMessage: "Live checks are temporarily unavailable. Showing a recorded case." };
    const unread = { ...emptyCase(), mode: "done" as const, replay: true, replayMessage: "Live checks are temporarily unavailable. Showing a recorded case." };
    expect(sheetFromView(limited).chips).toContain("Live checks are temporarily unavailable. Showing a recorded case.");
    expect(sheetFromView(unread).chips).toContain("Live checks are temporarily unavailable. Showing a recorded case.");
    const daily = { ...emptyCase(), mode: "done" as const, replay: true, replayMessage: "Live checks are temporarily unavailable. Showing a recorded case." };
    expect(sheetFromView(daily).chips).toContain("Live checks are temporarily unavailable. Showing a recorded case.");
    expect(sheetFromView(daily).chips).not.toContain("Live paused: spend limit reached");
  });
});

describe("spend meter", () => {
  it("closes the ledger before pending settlement and keeps the full reservation for invalid usage", async () => {
    resetSpendState();
    const ledger = new FakeLedger();
    const events: string[] = [];
    let releaseSettlement!: () => void;
    const pendingSettlement = new Promise<void>((resolve) => { releaseSettlement = resolve; });
    let settlementStarted!: () => void;
    const started = new Promise<void>((resolve) => { settlementStarted = resolve; });
    let settled: { reserved: SpendSnapshot; actual: SpendSnapshot } | undefined;
    ledger.close = async () => {
      events.push("close");
      ledger.closed = true;
    };
    ledger.settle = async (reserved, actual) => {
      events.push("settle");
      settled = { reserved: { ...reserved }, actual: { ...actual } };
      settlementStarted();
      await pendingSettlement;
      await FakeLedger.prototype.settle.call(ledger, reserved, actual);
    };
    const wrapped = meterResearch(research([], Number.NaN), ledger);
    const call = wrapped.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
    try {
      await started;
      // Inspect while settle is still pending: closing after it resolves is too late.
      expect(events).toEqual(["close", "settle"]);
      expect(ledger.closed).toBe(true);
      expect(spendLedgerBroken()).toBe(true);
      expect(settled).toEqual({ reserved: { usd: 0, tavilyCredits: 1 }, actual: { usd: 0, tavilyCredits: 1 } });
      expect(await ledger.read()).toEqual({ usd: 0, tavilyCredits: 1 });
    } finally {
      releaseSettlement();
      await call;
      resetSpendState();
    }
    expect(await ledger.read()).toEqual({ usd: 0, tavilyCredits: 1 });
  });

  it("reserves before the provider call and does not call once the reserve is refused", async () => {
    resetSpendState();
    const ledger = new FakeLedger();
    const calls: string[] = [];
    const wrapped = meterResearch(research(calls), ledger);
    const llm = meterLlm(model(calls, "nvidia/Nemotron-3_5-Lightning", { in: 0, out: 10 }), ledger);
    await wrapped.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
    await llm.complete({ task: "plan", model: "nvidia/Nemotron-3_5-Lightning", system: "", user: "", maxTokens: 10, temperature: 0 });
    expect(calls).toEqual(["search", "nvidia/Nemotron-3_5-Lightning"]);
    const snap = await ledger.read();
    expect(snap.tavilyCredits).toBe(1);
    expect(snap.usd).toBeCloseTo(nebiusCallUsd("nvidia/Nemotron-3_5-Lightning", { in: 0, out: 10 }), 10);
    ledger.snapshot = { usd: 0, tavilyCredits: 400 };
    await wrapped.search({ action: "search_news", query: "harbour", depth: "advanced", maxResults: 3 });
    await llm.complete({ task: "memo", model: "nvidia/Nemotron-3_5-Lightning", system: "", user: "", maxTokens: 10, temperature: 0 });
    expect(calls).toEqual(["search", "nvidia/Nemotron-3_5-Lightning"]);
    resetSpendState();
  });

  it("lets only one of two parallel searches through when one credit remains", async () => {
    resetSpendState();
    const previous = process.env.TAVILY_CREDIT_HARD_LIMIT;
    process.env.TAVILY_CREDIT_HARD_LIMIT = "2";
    const limits = { usd: 5, tavilyCredits: 2 };
    const ledger = new FakeLedger();
    ledger.snapshot = { usd: 0, tavilyCredits: 0 };
    const calls: string[] = [];
    const slow: ResearchProvider = {
      async search() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        calls.push("search");
        return { results: [], credits: 1 };
      },
      async extract() {
        return { pages: [], failed: [], credits: 1 };
      },
      async map() {
        return { urls: [], credits: 1 };
      },
      async crawl() {
        return { pages: [], credits: 1 };
      },
    };
    const wrapped = meterResearch(slow, ledger);
    const first = wrapped.search({ action: "search_reports", query: "a", depth: "basic", maxResults: 1 });
    const second = wrapped.search({ action: "search_reports", query: "b", depth: "basic", maxResults: 1 });
    const [a, b] = await Promise.all([first, second]);
    const errors = [a.error, b.error].filter(Boolean);
    expect(calls).toHaveLength(1);
    expect(errors).toEqual(["spend_limit"]);
    expect(decideSpendReserve({ usd: 0, tavilyCredits: 1 }, { usd: 0, tavilyCredits: 1 }, limits).ok).toBe(false);
    expect(decideSpendReserve({ usd: 0, tavilyCredits: 1, tavilyCreditsToday: 49 }, { usd: 0, tavilyCredits: 1 }, { ...limits, tavilyCreditsToday: 50 }).reason).toBe("spend_limit");
    if (previous === undefined) delete process.env.TAVILY_CREDIT_HARD_LIMIT;
    else process.env.TAVILY_CREDIT_HARD_LIMIT = previous;
  });

  it("charges the full reservation and blocks the next call when the provider returns a non-finite count", async () => {
    resetSpendState();
    const ledger = new FakeLedger();
    const calls: string[] = [];
    const wrapped = meterResearch(research(calls, Number.NaN), ledger);
    await wrapped.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
    expect((await ledger.read()).tavilyCredits).toBe(1);
    expect(spendLedgerBroken()).toBe(true);
    await wrapped.map("https://example.com");
    expect(calls).toEqual(["search"]);
    expect((await evaluateSpend(ledger, { usd: 5, tavilyCredits: 200 })).reason).toBe("spend_unreadable");
    resetSpendState();
  });

  it("charges the worst case when usage is omitted, keeping research open and closing the model ledger", async () => {
    resetSpendState();
    const ledger = new FakeLedger();
    const calls: string[] = [];
    const wrapped = meterResearch({
      async search() {
        calls.push("search");
        return { results: [], credits: 1, usageOmitted: true };
      },
      async extract() {
        return { pages: [], failed: [], credits: 1 };
      },
      async map() {
        return { urls: [], credits: 1 };
      },
      async crawl() {
        calls.push("crawl");
        return { pages: [], credits: 1, usageOmitted: true };
      },
    }, ledger);
    const crawled = await wrapped.crawl("https://example.com", "pages");
    expect(crawled.credits).toBe(4);
    expect((await ledger.read()).tavilyCredits).toBe(4);
    // Missing usage is charged at the held worst case and does not lock live checks out.
    expect(spendLedgerBroken()).toBe(false);
    await wrapped.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
    expect(calls).toEqual(["crawl", "search"]);
    expect((await ledger.read()).tavilyCredits).toBe(5);
    resetSpendState();

    const modelLedger = new FakeLedger();
    const reserved = nebiusReserveUsd("nvidia/Nemotron-3_5-Lightning", 1000, promptTokenBound({ system: "", user: "note" }));
    const llm = meterLlm({
      live: true,
      async complete(request) {
        return { text: "short", json: {}, model: request.model, tokens: { in: 4, out: 2 }, usageOmitted: true };
      },
    }, modelLedger);
    await llm.complete({ task: "plan", model: "nvidia/Nemotron-3_5-Lightning", system: "", user: "note", maxTokens: 1000, temperature: 0 });
    expect((await modelLedger.read()).usd).toBeCloseTo(reserved, 8);
    expect(spendLedgerBroken()).toBe(true);
    expect(modelLedger.closed).toBe(true);
    resetSpendState();

    let closed: string | null = null;
    const commands: unknown[][] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as unknown[];
      commands.push(args);
      if (args[0] === "GET" && args[1] === "spend:closed") return Response.json({ result: closed });
      if (args[0] === "SET" && args[1] === "spend:closed") {
        closed = String(args[2]);
        return Response.json({ result: "OK" });
      }
      if (args[0] === "EVAL") return Response.json({ result: 1 });
      return Response.json({ result: "0" });
    }) as typeof fetch;
    const shared = new UpstashSpendLedger("https://example.upstash.io", "token", fetchImpl);
    const metered = meterResearch({
      async search() {
        return { results: [], credits: 1 };
      },
      async extract() {
        return { pages: [], failed: [], credits: 1 };
      },
      async map() {
        return { urls: [], credits: 1 };
      },
      async crawl() {
        // A negative count is a broken reading, so the shared ledger closes.
        return { pages: [], credits: -1 };
      },
    }, shared);
    await metered.crawl("https://example.com", "pages");
    expect(commands).toContainEqual(["SET", "spend:closed", "1"]);
    expect(closed).toBe("1");
    resetSpendState();
    const other = new UpstashSpendLedger("https://example.upstash.io", "token", fetchImpl);
    expect(await other.reserve({ usd: 0, tavilyCredits: 1 }, { usd: 5, tavilyCredits: 200 })).toEqual({ ok: false, reason: "spend_unreadable" });
    expect(commands.some((command) => command[0] === "EVAL" && command[1] === SPEND_RESERVE_LUA && commands.indexOf(command) > commands.findIndex((item) => item[0] === "SET"))).toBe(false);
    resetSpendState();
  });

  it("returns the daily budget reason and does not call the provider", async () => {
    resetSpendState();
    const previous = process.env.TAVILY_DAILY_CREDIT_LIMIT;
    process.env.TAVILY_DAILY_CREDIT_LIMIT = "50";
    const ledger = new FakeLedger();
    ledger.snapshot = { usd: 0, tavilyCredits: 4, tavilyCreditsToday: 50 };
    const calls: string[] = [];
    const wrapped = meterResearch(research(calls), ledger);
    try {
      const result = await wrapped.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
      expect(result.error).toBe("daily_credit");
      expect(calls).toEqual([]);
      expect(await ledger.read()).toEqual({ usd: 0, tavilyCredits: 4, tavilyCreditsToday: 50 });
    } finally {
      if (previous === undefined) delete process.env.TAVILY_DAILY_CREDIT_LIMIT;
      else process.env.TAVILY_DAILY_CREDIT_LIMIT = previous;
      resetSpendState();
    }
  });
});

describe("upstash spend ledger", () => {
  it("reserves with one script, adjusts without an expiry, and fails closed on a store error", async () => {
    resetSpendState();
    const state = { usd: 0, month: 0, day: 0 };
    const calls: unknown[][] = [];
    const bucket = (key: string) => {
      if (!key.startsWith("spend:tavily:")) return null;
      const rest = key.slice("spend:tavily:".length);
      if (rest.length === 10) return "day" as const;
      if (rest === "total") return "month" as const;
      return null;
    };
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as unknown[];
      calls.push(args);
      const key = String(args[1] ?? "");
      if (args[0] === "GET" && key === "spend:closed") return Response.json({ result: null });
      if (args[0] === "GET" && key === "spend:usd") return Response.json({ result: String(state.usd) });
      if (args[0] === "GET" && bucket(key) === "month") return Response.json({ result: String(state.month) });
      if (args[0] === "GET" && bucket(key) === "day") return Response.json({ result: String(state.day) });
      if (args[0] === "EVAL" && args[1] === SPEND_MIGRATE_LUA) return Response.json({ result: 1 });
      if (args[0] === "EVAL") {
        const numkeys = Number(args[2]);
        const base = 3 + numkeys;
        const addUsd = Number(args[base]);
        const addCredits = Number(args[base + 1]);
        const decision = decideSpendReserve(
          { usd: state.usd, tavilyCredits: state.month, tavilyCreditsToday: state.day },
          { usd: addUsd, tavilyCredits: addCredits },
          { usd: Number(args[base + 2]), tavilyCredits: Number(args[base + 3]), tavilyCreditsToday: Number(args[base + 4]) },
        );
        if (!decision.ok) return Response.json({ result: decision.reason === "daily_credit" ? 2 : decision.reason === "spend_limit" ? 0 : -1 });
        state.usd += addUsd;
        state.month += addCredits;
        state.day += addCredits;
        return Response.json({ result: 1 });
      }
      if (args[0] === "INCRBYFLOAT" && key === "spend:usd") {
        state.usd += Number(args[2]);
        return Response.json({ result: String(state.usd) });
      }
      if (args[0] === "INCRBY" && bucket(key) === "month") {
        state.month += Number(args[2]);
        return Response.json({ result: state.month });
      }
      if (args[0] === "INCRBY" && bucket(key) === "day") {
        state.day += Number(args[2]);
        return Response.json({ result: state.day });
      }
      return Response.json({ error: "bad" }, { status: 500 });
    }) as typeof fetch;
    const ledger = new UpstashSpendLedger("https://example.upstash.io", "token", fetchImpl);
    const openLimits = { usd: 5, tavilyCredits: 200, tavilyCreditsToday: 50 };
    expect(await ledger.reserve({ usd: 0.25, tavilyCredits: 4 }, openLimits)).toEqual({ ok: true });
    await ledger.settle({ usd: 0.25, tavilyCredits: 4 }, { usd: 0.2, tavilyCredits: 3 });
    expect(await ledger.read()).toEqual({ usd: 0.2, tavilyCredits: 3, tavilyCreditsToday: 3 });
    const evalCall = calls.find((call) => call[0] === "EVAL" && call[1] === SPEND_RESERVE_LUA);
    expect(evalCall?.[1]).toBe(SPEND_RESERVE_LUA);
    expect(evalCall?.[2]).toBe(4);
    expect(evalCall?.[3]).toBe("spend:usd");
    expect(evalCall?.[4]).toBe("spend:tavily:total");
    expect(String(evalCall?.[5])).toMatch(/^spend:tavily:\d{4}-\d{2}-\d{2}$/);
    expect(calls.filter((call) => call[0] === "INCRBY").map((call) => String(call[1]))).toEqual([
      String(evalCall?.[4]),
      String(evalCall?.[5]),
    ]);
    expect(calls.some((call) => call[1] === "spend:tavily" || call.includes("EX"))).toBe(false);
    await ledger.settle(
      { usd: 0.2, tavilyCredits: 3, month: "2020-01", day: "2020-01-02" },
      { usd: 0.2, tavilyCredits: 2 },
    );
    expect(calls.filter((call) => call[0] === "INCRBY").map((call) => String(call[1]))).toContain("spend:tavily:total");
    expect(calls.filter((call) => call[0] === "INCRBY").map((call) => String(call[1]))).toContain("spend:tavily:2020-01-02");
    expect(SPEND_RESERVE_LUA).toContain("(usd + addUsd) >= maxUsd");
    expect(SPEND_RESERVE_LUA.indexOf("(day + addCredits) >= maxDay")).toBeGreaterThan(SPEND_RESERVE_LUA.indexOf("(total + addCredits) >= maxTotal"));
    state.day = 49;
    state.month = 10;
    expect(await ledger.reserve({ usd: 0, tavilyCredits: 2 }, openLimits)).toEqual({ ok: false, reason: "daily_credit" });
    expect(state).toEqual({ usd: 0.2, month: 10, day: 49 });
    state.month = 199;
    expect(await ledger.reserve({ usd: 0, tavilyCredits: 2 }, openLimits)).toEqual({ ok: false, reason: "spend_limit" });
    expect(state).toEqual({ usd: 0.2, month: 199, day: 49 });
    const broken = new UpstashSpendLedger("https://example.upstash.io", "token", (async () => {
      throw new Error("network");
    }) as typeof fetch);
    expect((await evaluateSpend(broken, { usd: 1, tavilyCredits: 200 })).reason).toBe("spend_unreadable");
    const again = new UpstashSpendLedger("https://example.upstash.io", "token", (async () => {
      throw new Error("should not be called");
    }) as typeof fetch);
    expect(await again.reserve({ usd: 0.1, tavilyCredits: 1 }, { usd: 5, tavilyCredits: 200 })).toEqual({ ok: false, reason: "spend_unreadable" });
    expect(spendLedgerBroken()).toBe(true);
    resetSpendState();
    const corrupt = new UpstashSpendLedger("https://example.upstash.io", "token", (async (_url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as unknown[];
      if (args[1] === "spend:closed") return Response.json({ result: null });
      if (String(args[1]).startsWith("spend:usd:")) return Response.json({ result: "nope" });
      return Response.json({ result: "1" });
    }) as typeof fetch);
    expect((await evaluateSpend(corrupt, { usd: 1, tavilyCredits: 200 })).reason).toBe("spend_unreadable");
    resetSpendState();
  });

  it("writes a closed flag when settle fails so another process stays shut", async () => {
    resetSpendState();
    let closed = false;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as unknown[];
      if (args[0] === "GET" && args[1] === "spend:closed") return Response.json({ result: closed ? "1" : null });
      if (args[0] === "GET" && String(args[1]).startsWith("spend:usd:")) return Response.json({ result: "0.2" });
      if (args[0] === "GET" && args[1] === "spend:tavily") return Response.json({ result: "1" });
      if (args[0] === "SET" && args[1] === "spend:closed") {
        closed = true;
        return Response.json({ result: "OK" });
      }
      if (args[0] === "INCRBYFLOAT") return Response.json({ error: "down" }, { status: 500 });
      return Response.json({ result: 1 });
    }) as typeof fetch;
    const ledger = new UpstashSpendLedger("https://example.upstash.io", "token", fetchImpl);
    await expect(ledger.settle({ usd: 0.2, tavilyCredits: 1 }, { usd: 0.05, tavilyCredits: 1 })).rejects.toThrow(/spend_store/);
    expect(closed).toBe(true);
    expect(spendLedgerBroken()).toBe(true);
    resetSpendState();
    const other = new UpstashSpendLedger("https://example.upstash.io", "token", fetchImpl);
    expect(spendLedgerBroken()).toBe(false);
    expect((await evaluateSpend(other, { usd: 5, tavilyCredits: 200 })).reason).toBe("spend_unreadable");
    resetSpendState();
  });

  it("does not fetch hosted or bring-your-own providers once the ceiling is reached", async () => {
    resetSpendState();
    const ledger = new FakeLedger();
    ledger.snapshot = { usd: 20, tavilyCredits: 0 };
    setSpendLedger(ledger);
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error("provider");
    }) as typeof fetch;
    try {
      const env = {
        ...process.env,
        TAVILY_API_KEY: "tvly-mock",
        NEBIUS_API_KEY: "nvapi-mock",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
      };
      const hosted = liveDeps(env);
      const byok = liveDeps(env, { researchKey: "tvly-visitor-key-ok", modelKey: "nvapi-visitor-key-ok" });
      const found = await hosted.research.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
      const brought = await byok.research.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
      expect(found.error).toBe("spend_limit");
      expect(brought.error).toBe("spend_limit");
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
      resetSpendState();
    }
  });

  it("meters a bring-your-own-keys call onto the same ledger", async () => {
    resetSpendState();
    const ledger = new FakeLedger();
    setSpendLedger(ledger);
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls.push("provider");
      return Response.json({ results: [], usage: { credits: 2 }, choices: [{ message: { content: "{}" } }], usage_tokens: {} });
    }) as typeof fetch;
    try {
      const deps = liveDeps(
        { ...process.env, TAVILY_API_KEY: "tvly-hosted", NEBIUS_API_KEY: "nvapi-hosted" },
        { researchKey: "tvly-visitor-key-ok", modelKey: "nvapi-visitor-key-ok" },
      );
      await deps.research.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 3 });
      expect(calls.length).toBeGreaterThan(0);
      expect((await ledger.read()).tavilyCredits).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = original;
      resetSpendState();
    }
  });

  it("refuses live mode when Upstash is missing, including in production", () => {
    resetSpendState();
    const env = { ...process.env, NODE_ENV: "production" as const, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" };
    const ledger = getSpendLedger(env);
    expect(ledger).toBeInstanceOf(UnavailableSpendLedger);
    expect(getSpendLedger(env)).toBe(ledger);
    resetSpendState();
    markSpendBroken();
    expect(spendLedgerBroken()).toBe(true);
    resetSpendState();
  });

  it("returns spend_unreadable, not spend_limit, when the store is missing", async () => {
    resetSpendState();
    const ledger = getSpendLedger({ ...process.env, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
    expect((await evaluateSpend(ledger, { usd: 5, tavilyCredits: 200 })).reason).toBe("spend_unreadable");
    resetSpendState();
  });
});

describe("model reserve bound", () => {
  it("reserves the whole prompt plus max_tokens at the selected price, and refuses an oversized prompt", async () => {
    const user = "word ".repeat(4000);
    const bound = promptTokenBound({ system: "s", user });
    expect(bound).toBeGreaterThanOrEqual(user.length);
    for (const model of ["nvidia/Nemotron-3_5-Lightning", "nvidia/Nemotron-3-Ultra-550b-a55b"]) {
      expect(nebiusReserveUsd(model, 300, bound)).toBeGreaterThanOrEqual(nebiusCallUsd(model, { in: bound, out: 300 }));
    }
    resetSpendState();
    const ledger = new FakeLedger();
    let called = false;
    const llm = meterLlm({ live: true, async complete(request) { called = true; return { text: "", json: {}, model: request.model, tokens: { in: 1, out: 1 } }; } }, ledger);
    const huge = await llm.complete({ task: "memo", model: "nvidia/Nemotron-3_5-Lightning", system: "", user: "x".repeat(40_000), maxTokens: 100, temperature: 0 });
    expect(huge.error).toBe("spend_limit");
    expect(called).toBe(false);
    resetSpendState();
  });
});

describe("failed provider calls", () => {
  const ask = { task: "plan" as const, model: "nvidia/Nemotron-3_5-Lightning", system: "", user: "x", maxTokens: 100, temperature: 0 };
  const search = { action: "search_reports" as const, query: "q", depth: "basic" as const, maxResults: 1 };

  it("keeps the whole reservation after any failure once the request was sent, 4xx included", async () => {
    resetSpendState();
    const ledger = new FakeLedger();
    const network = meterLlm({ live: true, async complete(request) { return { text: "", json: null, model: request.model, tokens: { in: 0, out: 0 }, error: "model_network" }; } }, ledger);
    await network.complete(ask);
    expect(ledger.snapshot.usd).toBeCloseTo(nebiusReserveUsd("nvidia/Nemotron-3_5-Lightning", 100, promptTokenBound(ask)), 10);
    const refusedLedger = new FakeLedger();
    const refused = meterLlm({ live: true, async complete(request) { return { text: "", json: null, model: request.model, tokens: { in: 0, out: 0 }, error: "http_400" }; } }, refusedLedger);
    await refused.complete(ask);
    expect(refusedLedger.snapshot.usd).toBeCloseTo(nebiusReserveUsd("nvidia/Nemotron-3_5-Lightning", 100, promptTokenBound(ask)), 10);
    const cancelledLedger = new FakeLedger();
    const cancelled = meterLlm({ live: true, async complete(request) { return { text: "", json: null, model: request.model, tokens: { in: 0, out: 0 }, error: "http_499" }; } }, cancelledLedger);
    await cancelled.complete(ask);
    expect(cancelledLedger.snapshot.usd).toBeCloseTo(nebiusReserveUsd("nvidia/Nemotron-3_5-Lightning", 100, promptTokenBound(ask)), 10);
    const gatewayLedger = new FakeLedger();
    const gateway = meterLlm({ live: true, async complete(request) { return { text: "", json: null, model: request.model, tokens: { in: 0, out: 0 }, error: "http_503" }; } }, gatewayLedger);
    await gateway.complete(ask);
    expect(gatewayLedger.snapshot.usd).toBeGreaterThan(0);
    const upstreamLedger = new FakeLedger();
    const upstream = meterResearch({ async search() { throw Object.assign(new Error("research search failed (502)"), { code: "upstream" }); } } as unknown as ResearchProvider, upstreamLedger);
    await expect(upstream.search(search)).rejects.toThrow();
    expect(upstreamLedger.snapshot.tavilyCredits).toBe(1);

    const researchLedger = new FakeLedger();
    const timeout = meterResearch({ async search() { throw Object.assign(new Error("research network"), { code: "network" }); } } as unknown as ResearchProvider, researchLedger);
    await expect(timeout.search(search)).rejects.toThrow();
    expect(researchLedger.snapshot.tavilyCredits).toBe(1);
    const httpLedger = new FakeLedger();
    const http = meterResearch({ async search() { throw Object.assign(new Error("research search failed (500)"), { code: "http" }); } } as unknown as ResearchProvider, httpLedger);
    await expect(http.search(search)).rejects.toThrow();
    expect(httpLedger.snapshot.tavilyCredits).toBe(1);
    const quotaLedger = new FakeLedger();
    const quota = meterResearch({ async search() { throw Object.assign(new Error("research quota 432"), { code: "quota" }); } } as unknown as ResearchProvider, quotaLedger);
    await expect(quota.search(search)).rejects.toThrow();
    expect(quotaLedger.snapshot.tavilyCredits).toBe(1);
    resetSpendState();
  });
});
