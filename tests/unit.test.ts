import { describe, expect, it, vi } from "vitest";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { authorizeLive, parseInviteCodes, redeemCode, type QuotaLimits } from "@/lib/abuse/gate";
import { parseByok, scrubSecrets } from "@/lib/byok";
import { quotaDefaults } from "@/lib/config";
import { toIntents } from "@/lib/choreo/choreographer";
import { pathLength, shortestPath } from "@/lib/choreo/pathfinding";
import { reduceCase, emptyCase } from "@/lib/case/reducer";
import { draftToFlag, scoreCase } from "@/lib/scoring/scorer";
import { sheetColor, sheetFromView, verdictStamp } from "@/lib/ui/live-sheet";
import { applySkippedScreenshot } from "@/lib/agent/machine";
import { BRAND_DOMAINS, lookalikeOf } from "@/lib/agent/lookalike";
import { looksLikePaymentCard, redactContext, validateIntake } from "@/lib/safety/redact";
import { isPrivateIp } from "@/lib/safety/ssrf";
import { TURNSTILE_CLIENT_MESSAGE, verifyTurnstile } from "@/lib/safety/turnstile";
import { validateFlags, validateMemo } from "@/lib/agent/validate";
import { getReplay } from "@/lib/replay/cache";
import { applyIntent, initialWorld, stepWorld } from "@/lib/world/sim";
import type { AgentEvent, Evidence, RedFlag } from "@/lib/types";

const limits: QuotaLimits = {
  accountAllowance: 3,
  ipDailyCap: 8,
  deviceDailyCap: 8,
  ratePerHour: 5,
  dailyCreditCap: 400,
  creditsPerLiveCase: 16,
  // Large so these tests isolate the per-network, device and owner limits from the shared day.
  globalDailyCap: 100,
};

function gate(store: MemoryUsageStore, overrides: Partial<Parameters<typeof authorizeLive>[0]> = {}) {
  return authorizeLive({
    userId: "user_1",
    human: true,
    keysConfigured: true,
    ip: "203.0.113.8",
    deviceId: "device-a",
    userAgent: "TestAgent",
    store,
    limits,
    now: new Date("2026-10-21T04:00:00Z"),
    publicQuota: true,
    ...overrides,
  });
}

describe("rubric", () => {
  it("caps complaint points and still trips a hard trigger", () => {
    const flags = [
      flag("C1", 30, 1, 1, "complaints"),
      flag("C2", 12, 1, 1, "complaints"),
      flag("C3", 20, 1, 1, "complaints"),
      flag("R1", 50, 1, 1, "other", true),
    ].filter((item): item is RedFlag => Boolean(item));
    const verdict = scoreCase({ flags, independentSources: 3, floorComplete: true, budgetExhausted: false, degraded: false });
    expect(verdict.level).toBe("High");
    expect(verdict.hard_triggers).toContain("R1");
    expect(verdict.score).toBeLessThanOrEqual(100);
    const complaintPoints = 30 + 12 + 20;
    expect(complaintPoints).toBeGreaterThan(35);
    expect(verdict.score).toBe(85);
  });

  it("does not call a weak adverse score Low without a legitimacy signal", () => {
    const flags = [flag("D1", 15, 1, 1, "other")].filter((item): item is RedFlag => Boolean(item));
    const verdict = scoreCase({ flags, independentSources: 1, floorComplete: true, budgetExhausted: false, degraded: false });
    expect(verdict.level).toBe("Not enough evidence");
    expect(verdict.unverified).toBe(true);
    expect(verdict.manual_review).toBe(false);
    expect(verdict.label).toBe("Not enough evidence / Unverified");
    const sheet = sheetFromView({ ...emptyCase(), mode: "done", verdict, input: "shopwisp.example", label: "shopwisp.example" });
    expect(sheet.stamp).toBe("Not enough evidence / Unverified");
    expect(sheet.score).toBeNull();
  });

  it("keeps a licensed Low when the screenshot was skipped", () => {
    const flags = [flag("M1", -30, 1, 1, "mitigation")].filter((item): item is RedFlag => Boolean(item));
    const verdict = scoreCase({ flags, independentSources: 2, floorComplete: true, budgetExhausted: false, degraded: false });
    expect(verdict.level).toBe("Low");
    expect(verdict.label).toBe("Low");
    expect(verdict.manual_review).toBe(false);
    const softened = applySkippedScreenshot(verdict);
    expect(softened.confidence).toBe("Low");
    expect(softened.label).toBe("Low");
    expect(softened.manual_review).toBe(false);
    expect(verdictStamp(softened)).toBe("Low risk");
    const stored = { ...softened, label: "Insufficient evidence — manual review" };
    expect(verdictStamp(stored)).toBe("Low risk");
  });

  it("keeps an M2 review hit unverified", () => {
    const flags = [flag("M2", -15, 1, 1, "mitigation")].filter((item): item is RedFlag => Boolean(item));
    const verdict = scoreCase({ flags, independentSources: 2, floorComplete: true, budgetExhausted: false, degraded: false });
    expect(verdict.level).toBe("Not enough evidence");
    expect(verdict.unverified).toBe(true);
    expect(verdict.label).toBe("Not enough evidence / Unverified");
    expect(verdict.manual_review).toBe(false);
  });

  it("keeps two regulator press reports at least 60 and High", () => {
    const flags = [flag("R3", 40, 1, 1, "other", true)].filter((item): item is RedFlag => Boolean(item));
    const verdict = scoreCase({ flags, independentSources: 2, floorComplete: true, budgetExhausted: false, degraded: false });
    expect(verdict.level).toBe("High");
    expect(verdict.hard_triggers).toEqual(["R3"]);
    expect(verdict.score).toBe(60);
    expect(verdict.unverified).toBe(false);
  });

  it("keeps an exact regulator warning at 75 even when a mitigation pulls the raw total down", () => {
    const flags = [flag("R1", 75, 1, 1, "other", true), flag("M4", -40, 1, 1, "mitigation")].filter((item): item is RedFlag => Boolean(item));
    const verdict = scoreCase({ flags, independentSources: 2, floorComplete: true, budgetExhausted: false, degraded: false });
    expect(verdict.level).toBe("High");
    expect(verdict.hard_triggers).toEqual(["R1"]);
    expect(verdict.score).toBe(75);
  });

  it("labels a score with no indicators as unverified", () => {
    const verdict = scoreCase({ flags: [], independentSources: 1, floorComplete: true, budgetExhausted: false, degraded: false });
    expect(verdict.level).toBe("Not enough evidence");
    expect(verdict.unverified).toBe(true);
    expect(verdict.manual_review).toBe(false);
    expect(verdict.label).toBe("Not enough evidence / Unverified");
    const view = {
      ...emptyCase(),
      mode: "done" as const,
      verdict,
      input: "The Quarnby Investment Bank",
      label: "The Quarnby Investment Bank",
    };
    const sheet = sheetFromView(view);
    const stamp = toIntents({ case_id: "cs", seq: 1, ts: "", type: "score.final", payload: { verdict } }).find((intent) => intent.type === "chief.stamp");
    expect(stamp && stamp.type === "chief.stamp" ? stamp.level : "").toBe("Not enough evidence");
    expect(sheet.stamp).toBe("Not enough evidence / Unverified");
    expect(sheet.score).toBeNull();
    expect(sheet.mix.some((slice) => slice.label === "Not scored")).toBe(false);
    expect(sheetColor(sheet)).not.toBe("#0c7a43");
  });
});

describe("abuse gates", () => {
  it("allows three hosted live checks and blocks the fourth until an invite code", async () => {
    const store = new MemoryUsageStore();
    const roomy = { ...limits, ratePerHour: 20, ipDailyCap: 20, deviceDailyCap: 20 };
    for (let i = 0; i < 3; i += 1) {
      const decision = await gate(store, { limits: roomy });
      expect(decision.mode).toBe("live");
    }
    const blocked = await gate(store, { limits: roomy });
    expect(blocked.status).toBe(402);
    const catalog = parseInviteCodes("PILOT-2026:10");
    const redeemed = await redeemCode(store, "user_1", "PILOT-2026", catalog, 3);
    expect(redeemed.ok).toBe(true);
    const again = await gate(store, { limits: roomy });
    expect(again.mode).toBe("live");
  });

  it("defaults a Google account to three hosted live checks", () => {
    const previous = process.env.ACCOUNT_QUOTA;
    delete process.env.ACCOUNT_QUOTA;
    try {
      expect(quotaDefaults().accountAllowance).toBe(3);
    } finally {
      if (previous !== undefined) process.env.ACCOUNT_QUOTA = previous;
    }
  });

  it("skips the shared spend cap and the account allowance when the caller brings keys", async () => {
    const store = new MemoryUsageStore();
    await store.addCredits("2026-10-21", 400);
    for (let i = 0; i < 6; i += 1) {
      const decision = await gate(store, { byok: true, keysConfigured: false, limits: { ...limits, ratePerHour: 50 } });
      expect(decision.mode).toBe("live");
      expect(decision.reason).toBe("byok");
    }
    expect((await store.getAccount("user_1")).used).toBe(0);
    expect(await store.getCredits("2026-10-21")).toBe(400);
    expect(JSON.stringify(await store.getAccount("user_1"))).not.toMatch(/tvly-|sk-|nvapi-/);
    const hosted = await gate(store);
    expect(hosted.mode).toBe("replay");
    expect(hosted.reason).toBe("daily_cap");
  });

  it("applies the network, device and hourly throttles to callers who bring keys", async () => {
    const store = new MemoryUsageStore();
    const tight = { ...limits, ratePerHour: 2, ipDailyCap: 50, deviceDailyCap: 50 };
    expect((await gate(store, { byok: true, limits: tight })).mode).toBe("live");
    expect((await gate(store, { byok: true, limits: tight })).mode).toBe("live");
    const third = await gate(store, { byok: true, limits: tight });
    expect(third).toMatchObject({ ok: false, status: 429, reason: "hourly" });
    const device = new MemoryUsageStore();
    const oneDevice = { ...limits, ratePerHour: 50, ipDailyCap: 50, deviceDailyCap: 1 };
    expect((await gate(device, { byok: true, limits: oneDevice })).mode).toBe("live");
    expect(await gate(device, { byok: true, limits: oneDevice, ip: "198.51.100.4" })).toMatchObject({ status: 429, reason: "device_daily" });
  });

  it("still requires a signed-in person when keys are brought", async () => {
    const store = new MemoryUsageStore();
    expect((await gate(store, { byok: true, userId: undefined })).status).toBe(401);
    expect((await gate(store, { byok: true, human: false })).status).toBe(403);
  });

  it("accepts a pair of browser keys and refuses a single key", () => {
    expect(parseByok({}).kind).toBe("none");
    expect(parseByok({ researchKey: "tvly-research-key-0001", modelKey: "" }).kind).toBe("incomplete");
    const ready = parseByok({ researchKey: "tvly-research-key-0001", modelKey: "nebius-model-key-0001" });
    expect(ready.kind).toBe("ready");
    if (ready.kind !== "ready") return;
    const scrubbed = scrubSecrets(`failed ${ready.researchKey} and ${ready.modelKey}`, [ready.researchKey, ready.modelKey]);
    expect(scrubbed).not.toContain(ready.researchKey);
    expect(scrubbed).not.toContain(ready.modelKey);
  });

  it("falls back to replay when the daily credit cap is exhausted and does not spend the account allowance", async () => {
    const store = new MemoryUsageStore();
    await store.addCredits("2026-10-21", 390);
    const decision = await gate(store);
    expect(decision.mode).toBe("replay");
    expect(decision.reason).toBe("daily_cap");
    expect((await store.getAccount("user_1")).used).toBe(0);
  });

  it("blocks a second account from the same network once the IP cap is hit", async () => {
    const store = new MemoryUsageStore();
    const byNetwork = { ...limits, ratePerHour: 30, accountAllowance: 20 };
    for (let i = 0; i < 8; i += 1) {
      const decision = await gate(store, { userId: `user_${i}`, deviceId: `device-${i}`, limits: byNetwork });
      expect(decision.mode).toBe("live");
    }
    const extra = await gate(store, { userId: "user_new", deviceId: "device-new", limits: byNetwork });
    expect(extra.status).toBe(429);
  });

  it("rate limits an IP within the hour", async () => {
    const store = new MemoryUsageStore();
    const loose = { ...limits, accountAllowance: 20, ipDailyCap: 20, deviceDailyCap: 20 };
    for (let i = 0; i < 5; i += 1) {
      expect((await gate(store, { limits: loose, deviceId: `d-${i}`, userId: `u-${i}` })).mode).toBe("live");
    }
    const limited = await gate(store, { limits: loose, deviceId: "d-x", userId: "u-x" });
    expect(limited.status).toBe(429);
    expect(limited.reason).toBe("hourly");
  });
});

describe("choreography", () => {
  it("walks hq to the clone island through the sitemap bridge", () => {
    const path = shortestPath("hq", "clones");
    expect(path[0]).toBe("hq");
    expect(path.at(-1)).toBe("clones");
    expect(path).toContain("sitemap");
    expect(path.length).toBe(4);
    expect(pathLength([[0, 0, 0], [3, 0, 0]])).toBe(3);
  });

  it("never picks up evidence before the scout is spawned", async () => {
    const replay = await getReplay("quantum-yield");
    expect(replay).not.toBeNull();
    const spawned = new Set<string>();
    const carried = new Set<string>();
    for (const event of replay?.events ?? []) {
      for (const intent of toIntents(event)) {
        if (intent.type === "scout.pickUp") {
          expect(spawned.has(intent.callId)).toBe(true);
          carried.add(intent.evidenceId);
        }
        if (intent.type === "scout.spawn") spawned.add(intent.callId);
        if (intent.type === "card.ribbon") {
          for (const id of intent.evidenceIds) expect(carried.has(id) || spawned.size > 0).toBe(true);
        }
      }
      if (event.type === "tool.started" && event.call_id) spawned.add(event.call_id);
    }
    expect(spawned.size).toBeGreaterThan(3);
  });

  it("moves a scout along the path and only then lets them work", () => {
    let world = initialWorld();
    world = applyIntent(world, { type: "scout.spawn", callId: "call_01", job: "seeker", destination: "newsstand", query: "example scam" });
    const before = world.actors[0]?.phase;
    expect(before).toBe("walk");
    for (let i = 0; i < 20; i += 1) world = stepWorld(world, 0.5);
    expect(world.actors[0]?.phase === "work" || world.actors[0]?.phase === "done" || world.actors[0]?.phase === "shrug").toBe(true);
  });
});

describe("reducer and safety", () => {
  it("ignores a repeated sequence number", () => {
    const event: AgentEvent = { case_id: "cs", seq: 1, ts: "", type: "case.started", payload: { input: "a.example" } };
    const once = reduceCase(emptyCase(), event);
    const twice = reduceCase(once, event);
    expect(twice.events).toHaveLength(1);
    expect(twice.input).toBe("a.example");
  });

  it("rejects card numbers and redacts context", () => {
    expect(looksLikePaymentCard("4242 4242 4242 4242")).toBe(true);
    expect(validateIntake("4242424242424242").ok).toBe(false);
    const redacted = redactContext("email ada@example.com card 4242424242424242");
    expect(redacted.text).not.toContain("ada@example.com");
    expect(redacted.text).not.toContain("4242");
    expect(redactContext("note tvly-research-key-0001 please").text).not.toContain("tvly-");
    expect(redacted.redactions).toBeGreaterThan(0);
  });

  it("blocks private and metadata addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("::1")).toBe(true);
  });

  it("recognises a lookalike and not an unrelated name", () => {
    expect(lookalikeOf("meridian-bank-alert.example")?.domain).toBe("meridianbank.example");
    expect(lookalikeOf("harbourpine.example")).toBeNull();
    const brand = BRAND_DOMAINS.find((item) => item.domain.endsWith(".com"))!;
    const lookalike = brand.domain.replace("a", "4");
    expect(lookalike).not.toBe(brand.domain);
    expect(lookalikeOf(lookalike)?.name).toBe(brand.name);
  });

  it("drops a memo tag that has no evidence", () => {
    const evidence: Evidence[] = [
      {
        evidence_id: "ev_01",
        kind: "web_page",
        url: "https://alerts.example/q",
        title: "Alert",
        source_domain: "alerts.example",
        source_type: "regulator",
        retrieved_at: "",
        tool: { name: "search", credits: 1 },
        quote: "Quantum Yield is on the investor alert list.",
        content_sha256: "abc",
      },
    ];
    expect(validateMemo("Listed on the alert list [ev_01].", evidence).ok).toBe(true);
    expect(validateMemo("Invented claim [ev_99].", evidence).ok).toBe(false);
    const flag = draftToFlag({
      signal_id: "R1",
      confidence: 1,
      source_reliability: 1,
      evidence_ids: ["ev_missing"],
      explanation: "nope",
      quote: "missing quote",
    });
    expect(validateFlags(flag ? [flag] : [], evidence, new Map([["R1", "missing quote"]])).dropped).toContain("R1");
  });

  it("verifies Turnstile with the siteverify response", async () => {
    let called = "";
    const ok = await verifyTurnstile({
      token: "token",
      secret: "secret",
      env: { NODE_ENV: "test", NEXT_PUBLIC_SITE_URL: "https://scamscout.example" },
      fetchImpl: async (input) => {
        called = String(input);
        return new Response(JSON.stringify({ success: true, hostname: "scamscout.example" }), { status: 200 });
      },
    });
    expect(ok.ok).toBe(true);
    expect(called).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const wrongHost = await verifyTurnstile({
      token: "token",
      secret: "secret",
      env: { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://scamscout.example" },
      fetchImpl: async () => new Response(JSON.stringify({ success: true, hostname: "evil.example" }), { status: 200 }),
    });
    expect(wrongHost).toMatchObject({ ok: false, reason: "turnstile_hostname", hostname: "evil.example" });
    expect(TURNSTILE_CLIENT_MESSAGE).toBe("The live check could not start. Try again.");
    const missing = await verifyTurnstile({ token: undefined, secret: "secret", env: { NODE_ENV: "production", VERCEL_ENV: "production" } });
    expect(missing.ok).toBe(false);
    const dev = await verifyTurnstile({ token: undefined, secret: undefined, env: { NODE_ENV: "development" } });
    expect(dev.reason).toBe("dev_bypass");
  });

  it("accepts the preview host when the production site URL is a different host", async () => {
    const previewHost = "preview.vercel.app";
    const logged: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((message) => {
      logged.push(String(message));
    });
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_URL: "scam-scout-abc123.vercel.app",
      VERCEL_BRANCH_URL: previewHost,
    };
    const branch = await verifyTurnstile({
      token: "token",
      secret: "secret",
      env,
      fetchImpl: async () => new Response(JSON.stringify({ success: true, hostname: previewHost }), { status: 200 }),
    });
    expect(branch).toMatchObject({ ok: true, reason: "verified", hostname: previewHost });
    const spoofed = await verifyTurnstile({
      token: "token",
      secret: "secret",
      env: { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://scamscout.example" },
      fetchImpl: async () => new Response(JSON.stringify({ success: true, hostname: previewHost }), { status: 200 }),
    });
    expect(spoofed).toMatchObject({ ok: false, reason: "turnstile_hostname", hostname: previewHost });
    const rejected = await verifyTurnstile({
      token: "token",
      secret: "secret",
      env,
      fetchImpl: async () => new Response(JSON.stringify({
        success: false,
        hostname: previewHost,
        "error-codes": ["timeout-or-duplicate"],
      }), { status: 200 }),
    });
    expect(rejected).toMatchObject({ ok: false, reason: "turnstile_rejected", hostname: previewHost, errorCodes: ["timeout-or-duplicate"] });
    expect(logged.some((line) => line.includes("turnstile_failed") && line.includes("timeout-or-duplicate") && !line.includes("secret"))).toBe(true);
    const forwarded = await verifyTurnstile({
      token: "token",
      secret: "secret",
      env: { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://scamscout.example", VERCEL_URL: "scam-scout-abc123.vercel.app" },
      fetchImpl: async () => new Response(JSON.stringify({ success: true, hostname: "evil.example" }), { status: 200 }),
    });
    expect(forwarded.ok).toBe(false);
    expect(forwarded.reason).toBe("turnstile_hostname");
    spy.mockRestore();
  });
});

function flag(id: string, weight: number, confidence: number, reliability: number, category: RedFlag["category"], hard = false): RedFlag | null {
  const drafted = draftToFlag({ signal_id: id, confidence, source_reliability: reliability, evidence_ids: ["ev_01"], explanation: id, weight, hard });
  if (!drafted) return null;
  return { ...drafted, category };
}
