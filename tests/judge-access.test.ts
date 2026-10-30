import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { authorizeLive, type QuotaLimits } from "@/lib/abuse/gate";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { JUDGE_FAILS_PER_IP, JUDGE_FAILS_TOTAL, verifyJudge } from "@/lib/auth/judge";
import { safeCallbackPath } from "@/lib/auth/callback";
import { allowSignIn } from "@/lib/auth/google";
import { quotaDefaults } from "@/lib/config";
import { isLiveOwner, liveGateFields } from "@/lib/safety/live-access";

const password = "correct horse battery staple 42";
const env = { JUDGE_USERNAME: "judges", JUDGE_PASSWORD_HASH: bcrypt.hashSync(password, 4), LIVE_MODE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;

describe("judge sign-in", () => {
  it("accepts the right name and password and nothing else", async () => {
    const store = new MemoryUsageStore();
    expect(await verifyJudge({ username: "judges", password }, "198.51.100.1", store, env)).toMatchObject({ id: "judge", role: "judge" });
    expect(await verifyJudge({ username: "judges", password: "wrong" }, "198.51.100.2", store, env)).toBeNull();
    expect(await verifyJudge({ username: "admin", password }, "198.51.100.3", store, env)).toBeNull();
    expect(await verifyJudge({ username: ["judges"], password }, "198.51.100.4", store, env)).toBeNull();
  });

  it("fails closed when the judge env vars are unset or the hash is not bcrypt", async () => {
    const store = new MemoryUsageStore();
    for (const broken of [{}, { JUDGE_USERNAME: "judges" }, { JUDGE_USERNAME: "judges", JUDGE_PASSWORD_HASH: password }]) {
      expect(await verifyJudge({ username: "judges", password }, "198.51.100.5", store, broken as NodeJS.ProcessEnv)).toBeNull();
    }
  });

  it("locks an address out after repeated failures, even for the right password", async () => {
    const store = new MemoryUsageStore();
    for (let i = 0; i < JUDGE_FAILS_PER_IP; i += 1) {
      expect(await verifyJudge({ username: "judges", password: `guess-${i}` }, "198.51.100.9", store, env)).toBeNull();
    }
    expect(await verifyJudge({ username: "judges", password }, "198.51.100.9", store, env)).toBeNull();
    expect(await verifyJudge({ username: "judges", password }, "198.51.100.10", store, env)).not.toBeNull();
  });

  it("holds the lockout when many guesses arrive at once", async () => {
    const store = new MemoryUsageStore();
    const guesses = Array.from({ length: 40 }, (_, i) => verifyJudge({ username: "judges", password: `guess-${i}` }, `198.51.100.${i % 4}`, store, env));
    const right = verifyJudge({ username: "judges", password }, "198.51.100.0", store, env);
    await Promise.all(guesses);
    expect(await right).toBeNull();
    expect(await store.getCount("judge-fail:all")).toBeLessThanOrEqual(JUDGE_FAILS_TOTAL);
  });

  it("only returns to a path on this site after sign-in", () => {
    const origin = "https://scam-scout.example";
    expect(safeCallbackPath("/demo?x=1#y", origin)).toBe(`${origin}/demo?x=1#y`);
    expect(safeCallbackPath(`${origin}/demo`, origin)).toBe(`${origin}/demo`);
    expect(new URL(safeCallbackPath(`${origin}//evil.example/path`, origin)).origin).toBe(origin);
    for (const bad of ["https://attacker.example", "//attacker.example/x", "javascript:alert(1)", "/\\attacker.example", null]) {
      expect(safeCallbackPath(bad, origin)).toBe("/demo");
    }
  });
});

describe("who can run a live check", () => {
  const limits: QuotaLimits = { accountAllowance: 3, ipDailyCap: 8, deviceDailyCap: 8, ratePerHour: 5, dailyCreditCap: 400, creditsPerLiveCase: 16 };
  const base = { human: true, keysConfigured: true, ip: "203.0.113.7", deviceId: "d", userAgent: "UA", limits, now: new Date("2026-10-30T08:00:00Z") };

  it("lets a signed-in judge run live, and keeps a plain Google user and an anonymous visitor on recordings", async () => {
    const store = new MemoryUsageStore();
    const judge = await authorizeLive({ ...base, store, userId: "judge", ...liveGateFields(undefined, env, "judge") });
    expect(judge.mode).toBe("live");
    const google = await authorizeLive({ ...base, store, userId: "g1", ...liveGateFields("someone@example.com", env) });
    expect(google).toMatchObject({ mode: "replay", reason: "live_invite_only" });
    const anonymous = await authorizeLive({ ...base, store, ...liveGateFields(undefined, env) });
    expect(anonymous).toMatchObject({ mode: "replay", reason: "live_invite_only" });
  });

  it("shows the judge the live desk only while live mode is on", () => {
    expect(isLiveOwner(undefined, env, "judge")).toBe(true);
    expect(isLiveOwner(undefined, { ...env, LIVE_MODE_ENABLED: "" } as NodeJS.ProcessEnv, "judge")).toBe(false);
    expect(isLiveOwner("someone@example.com", env)).toBe(false);
  });

  it("keeps the judge off when live mode is switched off", async () => {
    const off = { ...env, LIVE_MODE_ENABLED: "" } as NodeJS.ProcessEnv;
    const store = new MemoryUsageStore();
    expect((await authorizeLive({ ...base, store, userId: "judge", ...liveGateFields(undefined, off, "judge") })).mode).toBe("replay");
  });
});

describe("judge limits", () => {
  const roomy: QuotaLimits = { accountAllowance: 3, ipDailyCap: 100, deviceDailyCap: 100, ratePerHour: 100, dailyCreditCap: 400, creditsPerLiveCase: 16 };
  const at = { human: true, keysConfigured: true, deviceId: "d", userAgent: "UA", now: new Date("2026-10-30T08:00:00Z") };

  it("has no daily cap on judge live checks by default", async () => {
    expect(quotaDefaults({} as NodeJS.ProcessEnv).globalDailyCap).toBe(0);
    const store = new MemoryUsageStore();
    const fields = liveGateFields(undefined, { ...env, OWNER_DAILY_LIVE_CAP: "" } as NodeJS.ProcessEnv, "judge");
    for (let i = 0; i < 40; i += 1) {
      const run = await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.7", limits: roomy, ...fields });
      expect(run.mode).toBe("live");
    }
  });

  it("still holds the judge to the network, device and hourly limits", async () => {
    const store = new MemoryUsageStore();
    const fields = liveGateFields(undefined, env, "judge");
    const tight = { ...roomy, ratePerHour: 2 };
    expect((await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.8", limits: tight, ...fields })).mode).toBe("live");
    expect((await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.8", limits: tight, ...fields })).mode).toBe("live");
    expect(await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.8", limits: tight, ...fields })).toMatchObject({ status: 429 });
    const net = { ...roomy, ipDailyCap: 1 };
    expect((await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.9", limits: net, ...fields })).mode).toBe("live");
    expect(await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.9", limits: net, ...fields })).toMatchObject({ status: 429 });
  });

  it("still applies a shared daily cap when GLOBAL_LIVE_DAILY_CAP is set", async () => {
    const store = new MemoryUsageStore();
    const fields = liveGateFields(undefined, env, "judge");
    const capped = { ...roomy, globalDailyCap: 1 };
    expect((await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.10", limits: capped, ...fields })).mode).toBe("live");
    expect(await authorizeLive({ ...at, store, userId: "judge", ip: "203.0.113.10", limits: capped, ...fields })).toMatchObject({ reason: "global_daily_cap" });
  });
});

describe("google sign-in", () => {
  it("refuses a Google profile whose email is not verified", () => {
    expect(allowSignIn({ provider: "google" }, { email_verified: true })).toBe(true);
    expect(allowSignIn({ provider: "google" }, { email_verified: false })).toBe(false);
    expect(allowSignIn({ provider: "google" }, {})).toBe(false);
    expect(allowSignIn({ provider: "google" }, { email_verified: "true" })).toBe(false);
    expect(allowSignIn({ provider: "judge" }, undefined)).toBe(true);
  });
});
