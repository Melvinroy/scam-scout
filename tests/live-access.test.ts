import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileUsageStore, MemoryUsageStore, UpstashUsageStore, setUsageStore } from "@/lib/abuse/store";
import { authorizeLive, type QuotaLimits } from "@/lib/abuse/gate";
import { loadFixtureCapture, previewFromCapture, writeCaptureFixture } from "@/lib/captures/files";
import type { CaptureRecord } from "@/lib/captures/types";
import { redactSecrets } from "@/lib/byok";
import { emptyCase } from "@/lib/case/reducer";
import { getReplay } from "@/lib/replay/cache";
import { allowlistEmails, isAllowlistedEmail, isLiveOwner, liveGateFields, liveModeEnabled, OWNER_DAILY_LIVE_CAP_DEFAULT, ownerDailyLiveCap, ownerSubjectToSpendStop } from "@/lib/safety/live-access";
import { evaluateSpend, type SpendLedger, type SpendSnapshot } from "@/lib/safety/spend";
import { sheetFromView } from "@/lib/ui/live-sheet";
import type { CaseReport } from "@/lib/types";

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

const roomy: QuotaLimits = { ...limits, ratePerHour: 30, ipDailyCap: 30, deviceDailyCap: 30, accountAllowance: 30, dailyCreditCap: 400 };
const day = "2026-10-21";
const ownerEmail = "owner@example.com";

function ownerFields(overrides: Partial<Parameters<typeof authorizeLive>[0]> = {}) {
  return {
    liveModeEnabled: true,
    allowlisted: true,
    email: ownerEmail,
    ownerDailyOnly: true,
    limits: roomy,
    ...overrides,
  };
}

function ipuaKey(ip = "203.0.113.8", userAgent = "TestAgent") {
  return `ipua:${createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 16)}:${day}`;
}

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
    ...overrides,
  });
}

class FakeLedger implements SpendLedger {
  constructor(private snapshot: SpendSnapshot) {}

  async read(): Promise<SpendSnapshot> {
    return { ...this.snapshot };
  }

  async reserve() {
    return { ok: false as const, reason: "spend_limit" as const };
  }

  async settle() {}

  async close() {}
}

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

function sampleCapture(id = "cs_2026-10-21_ab12"): CaptureRecord {
  const report = {
    case_id: id,
    input: {
      raw: "harbourdesk.example",
      context: "Investment site",
      entity_type: "domain",
      canonical: { domain: "harbourdesk.example", names: ["Harbour Desk"] },
    },
    verdict: {
      level: "High",
      score: 80,
      confidence: "High",
      label: "High",
      hard_triggers: ["R1"],
      primary_typology: "investment_scam",
      secondary_typology: null,
      budget_exhausted: false,
      degraded: false,
      radar: { investment_scam: 80, fake_shop: 0, impersonation: 0, app_mule: 0 },
      manual_review: false,
    },
    red_flags: [],
    mitigations: [],
    evidence: [],
    memo: "MODEL-OUTPUT-SENTINEL Decision support only — not a determination of fraud.",
    costs: { tavily_credits: 2, llm_tokens: { in: 10, out: 20 }, usd_est: 0.02, wall_ms: 1200 },
    timings: { wall_ms: 1200 },
    versions: { rubric: "1.0.0", prompts: "2026-10-21", app: "0.9.0" },
    mode: "live",
    trace: [{ step: 1, state: "decide", action: "stop", reason: "enough", model: "fixture" }],
  } as CaseReport;
  return {
    id,
    createdAt: "2026-10-21T04:00:00.000Z",
    ownerEmail: "owner@example.com",
    input: "harbourdesk.example",
    context: "Investment site",
    mode: "live",
    report,
    events: [
      {
        case_id: id,
        seq: 1,
        ts: "2026-10-21T04:00:00.000Z",
        type: "case.done",
        payload: { marker: "EVENT-SENTINEL" },
      },
    ],
    promoted: false,
  };
}

describe("owner live access", () => {
  it("keeps live mode off and the owner cap at 15 when the env is unset", () => {
    withEnv(
      { LIVE_MODE_ENABLED: undefined, LIVE_ALLOWLIST_EMAILS: undefined, OWNER_DAILY_LIVE_CAP: undefined },
      () => {
        expect(liveModeEnabled()).toBe(false);
        expect(allowlistEmails()).toEqual([]);
        expect(ownerDailyLiveCap()).toBe(15);
        expect(OWNER_DAILY_LIVE_CAP_DEFAULT).toBe(15);
        expect(isLiveOwner("owner@example.com")).toBe(false);
      },
    );
  });

  it("reads the allowlist, uses 15 when blank, and tightens a bad or low cap to one", () => {
    withEnv(
      {
        LIVE_MODE_ENABLED: " YES ",
        LIVE_ALLOWLIST_EMAILS: "Owner@Example.com, not-an-email; second@example.com\nthird@example.com",
        OWNER_DAILY_LIVE_CAP: "0",
      },
      () => {
        expect(liveModeEnabled()).toBe(true);
        expect(allowlistEmails()).toEqual(["owner@example.com", "second@example.com", "third@example.com"]);
        expect(isAllowlistedEmail("OWNER@example.com")).toBe(true);
        expect(isAllowlistedEmail("other@example.com")).toBe(false);
        expect(ownerDailyLiveCap()).toBe(1);
        expect(liveGateFields("owner@example.com").ownerDailyOnly).toBe(true);
        expect(liveGateFields("other@example.com")).toMatchObject({ liveModeEnabled: true, allowlisted: false, ownerDailyOnly: false });
      },
    );
    withEnv({ OWNER_DAILY_LIVE_CAP: "  " }, () => expect(ownerDailyLiveCap()).toBe(15));
    withEnv({ OWNER_DAILY_LIVE_CAP: "nope" }, () => expect(ownerDailyLiveCap()).toBe(1));
    withEnv({ OWNER_DAILY_LIVE_CAP: "100000" }, () => expect(ownerDailyLiveCap()).toBe(50));
  });

  it("keeps live checks closed when the owner fields are omitted", async () => {
    const store = new MemoryUsageStore();
    const decision = await gate(store, { limits: roomy });
    expect(decision).toMatchObject({ mode: "replay", reason: "live_invite_only" });
    expect((await store.getAccount("user_1")).used).toBe(0);
    const quota = await gate(store, { limits: roomy, publicQuota: true });
    expect(quota.mode).toBe("live");
  });

  it("plays a recording for everyone off the allowlist, including a signed-out caller and a bring-your-own-keys caller", async () => {
    const store = new MemoryUsageStore();
    const off = await gate(store, { liveModeEnabled: false, allowlisted: true, byok: true });
    expect(off).toMatchObject({ mode: "replay", reason: "live_invite_only" });
    const stranger = await gate(store, { liveModeEnabled: true, allowlisted: false, email: "other@example.com", byok: true });
    expect(stranger).toMatchObject({ mode: "replay", reason: "live_invite_only", status: 200 });
    const signedOut = await gate(store, { liveModeEnabled: true, allowlisted: false, userId: undefined, email: undefined });
    expect(signedOut.mode).toBe("replay");
    expect(signedOut.status).not.toBe(401);
    expect((await store.getAccount("user_1")).used).toBe(0);
    expect(await store.getCredits(day)).toBe(0);
  });

  it("runs a live check for an allowlisted email and stops on the configured daily cap", async () => {
    const store = new MemoryUsageStore();
    const owner = ownerFields({ email: "Owner@Example.com", ownerDailyCap: 10 });
    for (let i = 0; i < 10; i += 1) expect((await gate(store, owner)).mode).toBe("live");
    const blocked = await gate(store, { ...owner, email: "owner@example.com" });
    expect(blocked).toMatchObject({ mode: "replay", reason: "owner_daily_cap" });
    expect(await store.getCount(`owner:owner@example.com:${day}`)).toBe(10);
    expect((await store.getAccount("user_1")).used).toBe(0);
    expect(await store.getCredits(day)).toBe(0);
  });

  it("uses 15 when the owner cap is omitted and stops on the 16th run", async () => {
    const store = new MemoryUsageStore();
    const owner = ownerFields();
    for (let i = 0; i < 15; i += 1) expect((await gate(store, owner)).mode).toBe("live");
    expect((await gate(store, owner)).reason).toBe("owner_daily_cap");
    expect(await store.getCount(`owner:${ownerEmail}:${day}`)).toBe(15);
    expect(await store.getCredits(day)).toBe(0);
  });

  it("counts an owner bring-your-own-keys run and skips the shared pool", async () => {
    const store = new MemoryUsageStore();
    const owner = { liveModeEnabled: true, allowlisted: true, email: "owner@example.com", ownerDailyCap: 1, ownerDailyOnly: true, byok: true };
    expect((await gate(store, owner)).reason).toBe("byok");
    expect((await gate(store, owner)).reason).toBe("owner_daily_cap");
    expect(await store.getCredits(day)).toBe(0);
    expect((await store.getAccount("user_1")).used).toBe(0);
  });

  it("releases the owner hold when sign-in, the bot check, or missing provider keys stop the run", async () => {
    const missingUser = new MemoryUsageStore();
    const denied = await gate(missingUser, ownerFields({ userId: undefined }));
    expect(denied.status).toBe(401);
    expect(await missingUser.getCount(`owner:${ownerEmail}:${day}`)).toBe(0);

    const bot = new MemoryUsageStore();
    expect((await gate(bot, ownerFields({ human: false }))).status).toBe(403);
    expect(await bot.getCount(`owner:${ownerEmail}:${day}`)).toBe(0);

    const unconfigured = new MemoryUsageStore();
    expect((await gate(unconfigured, ownerFields({ keysConfigured: false }))).reason).toBe("providers_unconfigured");
    expect(await unconfigured.getCount(`owner:${ownerEmail}:${day}`)).toBe(0);
  });

  it("does not apply the network cap to an allowlisted owner", async () => {
    const ownerStore = new MemoryUsageStore();
    const tight = { ...roomy, ipDailyCap: 0 };
    expect((await gate(ownerStore, ownerFields({ limits: tight }))).mode).toBe("live");
    expect(await ownerStore.getCount(`ip:203.0.113.8:${day}`)).toBe(0);
    expect(await ownerStore.getCount(`owner:${ownerEmail}:${day}`)).toBe(1);

    const visitor = new MemoryUsageStore();
    const blocked = await gate(visitor, { limits: tight, publicQuota: true });
    expect(blocked.status).toBe(429);
    expect(blocked.reason).toBe("ip_daily");
  });

  it("does not apply the network fingerprint cap to an allowlisted owner", async () => {
    const ownerStore = new MemoryUsageStore();
    expect((await gate(ownerStore, ownerFields({ limits: { ...roomy, ipDailyCap: 0 } }))).mode).toBe("live");
    expect(await ownerStore.getCount(ipuaKey())).toBe(0);

    const visitor = new MemoryUsageStore();
    expect((await gate(visitor, { limits: roomy, publicQuota: true })).mode).toBe("live");
    expect(await visitor.getCount(ipuaKey())).toBe(1);
    expect(await visitor.getCount(`ip:203.0.113.8:${day}`)).toBe(1);
  });

  it("does not apply the device cap to an allowlisted owner", async () => {
    const ownerStore = new MemoryUsageStore();
    const tight = { ...roomy, deviceDailyCap: 0 };
    expect((await gate(ownerStore, ownerFields({ limits: tight }))).mode).toBe("live");
    expect(await ownerStore.getCount(`device:device-a:${day}`)).toBe(0);

    const visitor = new MemoryUsageStore();
    const blocked = await gate(visitor, { limits: tight, publicQuota: true });
    expect(blocked.status).toBe(429);
    expect(blocked.reason).toBe("device_daily");
  });

  it("does not apply the account allowance to an allowlisted owner", async () => {
    const ownerStore = new MemoryUsageStore();
    const tight = { ...roomy, accountAllowance: 0 };
    expect((await gate(ownerStore, ownerFields({ limits: tight }))).mode).toBe("live");
    expect((await ownerStore.getAccount("user_1")).used).toBe(0);

    const visitor = new MemoryUsageStore();
    const blocked = await gate(visitor, { limits: tight, publicQuota: true });
    expect(blocked.status).toBe(402);
    expect(blocked.reason).toBe("account_allowance");
    // A 402 plays nothing, so the message must not promise a recording.
    expect(blocked.error).toBe("Live checks are temporarily unavailable. Choose a recorded example.");
  });

  it("does not apply the shared credit pool to an allowlisted owner", async () => {
    const ownerStore = new MemoryUsageStore();
    await ownerStore.addCredits(day, 400);
    const full = { ...roomy, dailyCreditCap: 400 };
    expect((await gate(ownerStore, ownerFields({ limits: full }))).mode).toBe("live");
    expect(await ownerStore.getCredits(day)).toBe(400);
    expect(await ownerStore.getCount(`owner:${ownerEmail}:${day}`)).toBe(1);

    const visitor = new MemoryUsageStore();
    await visitor.addCredits(day, 400);
    const blocked = await gate(visitor, { limits: full, publicQuota: true });
    expect(blocked).toMatchObject({ mode: "replay", reason: "daily_cap" });
    expect(await visitor.getCredits(day)).toBe(400);
  });

  it("still subjects an allowlisted owner to the 5 USD stop and the 200-credit stop", async () => {
    expect(ownerSubjectToSpendStop(true, true)).toBe(true);
    expect(ownerSubjectToSpendStop(true, false)).toBe(false);
    expect(ownerSubjectToSpendStop(false, true)).toBe(false);
    const atUsd = new FakeLedger({ usd: 5, tavilyCredits: 0 });
    expect(await evaluateSpend(atUsd, { usd: 5, tavilyCredits: 200 })).toMatchObject({ open: false, reason: "spend_limit" });
    const atCredits = new FakeLedger({ usd: 0, tavilyCredits: 200 });
    expect(await evaluateSpend(atCredits, { usd: 5, tavilyCredits: 200 })).toMatchObject({ open: false, reason: "spend_limit", tavilyCredits: 200 });
  });

  it("does not apply the hourly limit to an allowlisted owner", async () => {
    const store = new MemoryUsageStore();
    const owner = {
      liveModeEnabled: true,
      allowlisted: true,
      email: "owner@example.com",
      ownerDailyCap: 10,
      ownerDailyOnly: true,
      limits: { ...roomy, ratePerHour: 3 },
    };
    for (let i = 0; i < 4; i += 1) expect((await gate(store, owner)).mode).toBe("live");
    expect(await store.getCount("hour:203.0.113.8:2026-10-21T04")).toBe(0);
    expect((await gate(store, owner)).mode).toBe("live");

    const visitor = new MemoryUsageStore();
    const hourly = { ...limits, accountAllowance: 20, ipDailyCap: 20, deviceDailyCap: 20, ratePerHour: 3 };
    for (let i = 0; i < 3; i += 1) {
      expect((await gate(visitor, { limits: hourly, deviceId: `d-${i}`, userId: `u-${i}`, publicQuota: true })).mode).toBe("live");
    }
    const blocked = await gate(visitor, { limits: hourly, deviceId: "d-x", userId: "u-x", publicQuota: true });
    expect(blocked.status).toBe(429);
    expect(blocked.reason).toBe("hourly");
  });

  it("names the invite-only recording on the case sheet", () => {
    const view = { ...emptyCase(), mode: "done" as const, replay: true, replayMessage: "Live checks are temporarily unavailable." };
    expect(sheetFromView(view).chips).toContain("Live checks are temporarily unavailable.");
    const capped = { ...emptyCase(), mode: "done" as const, replay: true, replayMessage: "Live checks are temporarily unavailable. Showing a recorded case." };
    expect(sheetFromView(capped).chips).toContain("Live checks are temporarily unavailable. Showing a recorded case.");
  });
});

describe("captures", () => {
  it("keeps a capture after the report window and lists it without the case file", async () => {
    let now = 0;
    const store = new MemoryUsageStore(() => now);
    const capture = sampleCapture();
    await store.saveReport("c1", { ok: true });
    await store.saveCapture(capture);
    now = 15 * 86_400_000;
    expect(await store.getReport("c1")).toBeNull();
    const loaded = await store.getCapture(capture.id);
    expect(loaded?.report.memo).toContain("MODEL-OUTPUT-SENTINEL");
    expect(loaded?.events[0]?.payload.marker).toBe("EVENT-SENTINEL");
    expect(loaded?.report.timings.wall_ms).toBe(1200);
    const listed = await store.listCaptures();
    expect(listed).toEqual([
      { id: capture.id, createdAt: capture.createdAt, input: capture.input, verdict: "High risk", tavilyCredits: 2, promoted: false, previewId: undefined },
    ]);
    expect(JSON.stringify(listed)).not.toContain("MODEL-OUTPUT-SENTINEL");
    expect(JSON.stringify(listed)).not.toContain("EVENT-SENTINEL");
    const promoted = await store.markPromoted(capture.id, capture.id);
    expect(promoted?.promoted).toBe(true);
    expect(promoted?.previewId).toBe(capture.id);
    expect(await store.deleteCapture(capture.id)).toBe(true);
    expect(await store.getCapture(capture.id)).toBeNull();
    expect(await store.listCaptures()).toEqual([]);
    expect(await store.deleteCapture(capture.id)).toBe(false);
  });

  it("lists a stored Low with the same words as the result card", async () => {
    const store = new MemoryUsageStore();
    const capture = sampleCapture("cs_2026-10-22_low1");
    capture.report = {
      ...capture.report,
      verdict: {
        ...capture.report.verdict,
        level: "Low",
        score: 0,
        confidence: "Low",
        label: "Insufficient evidence — manual review",
        hard_triggers: [],
        manual_review: true,
        unverified: false,
      },
    };
    await store.saveCapture(capture);
    expect((await store.listCaptures())[0]?.verdict).toBe("Low risk");
  });

  it("round-trips a capture through the file store", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "scout-usage-"));
    const file = path.join(dir, "usage.json");
    const first = new FileUsageStore(file);
    await first.ready();
    await first.saveCapture(sampleCapture());
    await first.markPromoted("cs_2026-10-21_ab12", "cs_2026-10-21_ab12");
    const second = new FileUsageStore(file);
    await second.ready();
    const loaded = await second.getCapture("cs_2026-10-21_ab12");
    expect(loaded?.promoted).toBe(true);
    expect(loaded?.report.trace[0]?.model).toBe("fixture");
  });

  it("writes a promoted preview and plays the stored events", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "scout-captures-"));
    const capture = sampleCapture();
    const written = await writeCaptureFixture(capture, dir);
    const again = await writeCaptureFixture(capture, dir);
    expect(again.file).toBe(written.file);
    const index = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8")) as { ids: string[] };
    expect(index.ids).toEqual([capture.id]);
    const loaded = loadFixtureCapture(capture.id, dir);
    const preview = loaded ? previewFromCapture(loaded) : null;
    expect(preview?.events).toEqual(capture.events);
    expect(preview?.report.memo).toContain("MODEL-OUTPUT-SENTINEL");
    expect(preview?.report.timings.wall_ms).toBe(1200);
    expect(preview?.label).toBe("harbourdesk.example");
    expect(loadFixtureCapture("../secret", dir)).toBeNull();
    await expect(writeCaptureFixture({ ...capture, id: "../secret" }, dir)).rejects.toThrow(/Unsafe/);
  });

  it("stops replaying a promoted capture once the owner deletes it", async () => {
    const store = new MemoryUsageStore();
    setUsageStore(store);
    try {
      const capture = { ...sampleCapture("cs_2026-10-21_de1e"), promoted: true };
      await store.saveCapture(capture);
      expect((await getReplay(capture.id))?.id).toBe(capture.id);
      await store.deleteCapture(capture.id);
      expect(await getReplay(capture.id)).toBeNull();
    } finally {
      setUsageStore(null);
    }
  });

  it("does not replay an unknown capture id", async () => {
    expect(await getReplay("cs_2026-10-21_ffff")).toBeNull();
    expect(await getReplay("../secret")).toBeNull();
  });

  it("stores an Upstash capture without an expiry", async () => {
    const capture = sampleCapture();
    const calls: unknown[][] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as unknown[];
      calls.push(args);
      if (args[0] === "LRANGE") return Response.json({ result: [capture.id] });
      if (args[0] === "GET") return Response.json({ result: JSON.stringify({ ...capture, promoted: true, previewId: capture.id }) });
      return Response.json({ result: "OK" });
    }) as typeof fetch;
    const store = new UpstashUsageStore("https://example.upstash.io", "token", fetchImpl);
    await store.saveCapture(capture);
    const set = calls.find((call) => call[0] === "SET");
    expect(set?.[0]).toBe("SET");
    expect(set?.[1]).toBe(`capture:${capture.id}`);
    expect(set).not.toContain("EX");
    expect(calls.some((call) => call[0] === "LPUSH" && call[2] === capture.id)).toBe(true);
    const listed = await store.listCaptures();
    expect(listed[0]?.verdict).toBe("High risk");
    expect(listed[0]?.tavilyCredits).toBe(2);
    expect(JSON.stringify(listed)).not.toContain("EVENT-SENTINEL");
    await store.deleteCapture(capture.id);
    const removed = calls.filter((call) => call[0] === "DEL" || call[0] === "LREM");
    expect(removed).toContainEqual(["DEL", `capture:${capture.id}`]);
    expect(removed).toContainEqual(["LREM", "captures:index", 0, capture.id]);
  });

  it("leaves a long capture intact when a key is redacted", () => {
    const secret = "tvly-research-key-0001";
    const body = `${secret} ${"x".repeat(400)}`;
    const redacted = redactSecrets(body, [secret]);
    expect(redacted).not.toContain(secret);
    expect(redacted.length).toBeGreaterThan(300);
    expect(redacted.startsWith("[redacted]")).toBe(true);
  });
});
