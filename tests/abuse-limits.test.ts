import { describe, expect, it, vi } from "vitest";

// The guard runs before the session is read, so auth is never reached in these cases.
vi.mock("@/auth", () => ({ auth: async () => { throw new Error("auth must not run before the origin guard"); } }));
import { redeemCode } from "@/lib/abuse/gate";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { readJsonBody } from "@/lib/http/body";

describe("invite codes", () => {
  it("stop answering after ten tries a day on one account, even for a valid code", async () => {
    const store = new MemoryUsageStore();
    const catalog = new Map([["PILOT-2026", 5]]);
    for (let i = 0; i < 10; i += 1) {
      expect((await redeemCode(store, "user_1", `GUESS-${i}`, catalog, 3)).ok).toBe(false);
    }
    const blocked = await redeemCode(store, "user_1", "PILOT-2026", catalog, 3);
    expect(blocked).toMatchObject({ ok: false, error: "That code could not be applied." });
    expect((await redeemCode(store, "user_2", "PILOT-2026", catalog, 3)).ok).toBe(true);
    // Every refusal reads the same, so the copy does not reveal redemption history.
    expect(await redeemCode(store, "user_2", "PILOT-2026", catalog, 3)).toMatchObject({ ok: false, error: "That code could not be applied." });
    expect(await redeemCode(store, "user_3", "NOPE", catalog, 3)).toMatchObject({ ok: false, error: "That code could not be applied." });
  });
});

describe("request bodies", () => {
  const post = (body: string) => new Request("https://scamscout.example/api/cases", { method: "POST", body });
  it("parse a small JSON body", async () => {
    expect(await readJsonBody(post(JSON.stringify({ input: "harbourdesk.example" })))).toEqual({ input: "harbourdesk.example" });
  });
  it("refuse a body over the limit without parsing it, and treat bad JSON as empty", async () => {
    await expect(readJsonBody(post(JSON.stringify({ input: "x".repeat(20_000) })))).resolves.toBeNull();
    await expect(readJsonBody(post("{not json"))).resolves.toEqual({});
  });
});

describe("cookie-authenticated JSON posts", () => {
  const make = (headers: Record<string, string>) =>
    new Request("https://scamscout.example/api/cases", { method: "POST", headers: { host: "scamscout.example", ...headers }, body: "{}" });

  it("refuse a cross-site or missing origin, and a body not declared as JSON", async () => {
    const { rejectCrossSite } = await import("@/lib/http/origin");
    expect(rejectCrossSite(make({ "content-type": "application/json" }))?.status).toBe(403);
    expect(rejectCrossSite(make({ origin: "https://evil.example", "content-type": "application/json" }))?.status).toBe(403);
    expect(rejectCrossSite(make({ origin: "https://scamscout.example", "content-type": "text/plain" }))?.status).toBe(415);
    expect(rejectCrossSite(make({ origin: "https://scamscout.example" }))?.status).toBe(415);
    expect(rejectCrossSite(make({ origin: "https://scamscout.example", "content-type": "application/json; charset=utf-8" }))).toBeNull();
    expect(rejectCrossSite(make({ origin: "http://scamscout.example", "content-type": "application/json" }))?.status).toBe(403);
    expect(rejectCrossSite(make({ origin: "https://scamscout.example:8443", "content-type": "application/json" }))?.status).toBe(403);
  });

  it("are refused by the case and invite routes before any other work", async () => {
    const routes = [await import("@/app/api/cases/route"), await import("@/app/api/invites/route"), await import("@/app/api/human/route")];
    for (const route of routes) {
      expect((await route.POST(make({ origin: "https://evil.example", "content-type": "application/json" }))).status).toBe(403);
      expect((await route.POST(make({ origin: "https://scamscout.example", "content-type": "text/plain" }))).status).toBe(415);
      expect((await route.POST(make({ origin: "http://scamscout.example", "content-type": "application/json" }))).status).toBe(403);
      expect((await route.POST(make({ origin: "https://sub.scamscout.example", "content-type": "application/json" }))).status).toBe(403);
    }
  });
});

describe("the bot-check route", () => {
  it("stops verifying after the hourly tries for one account", async () => {
    vi.resetModules();
    vi.stubEnv("USAGE_DATA_FILE", `/tmp/scam-scout-human-test-${process.pid}-${Date.now()}.json`);
    vi.doMock("@/auth", () => ({ auth: async () => ({ user: { id: "user_flood" } }) }));
    const verify = vi.fn(async () => ({ ok: false, reason: "turnstile_failed" }));
    vi.doMock("@/lib/safety/turnstile", async (load) => ({ ...(await load<object>()), verifyTurnstile: verify }));
    const { POST } = await import("@/app/api/human/route");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await POST(new Request("https://scamscout.example/api/human", { method: "POST", headers: { host: "scamscout.example", origin: "https://scamscout.example", "content-type": "application/json", "x-real-ip": `198.51.100.${i}` }, body: JSON.stringify({ token: "t" }) }));
      statuses.push(res.status);
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(2);
    expect(verify).toHaveBeenCalledTimes(10);
    vi.doUnmock("@/auth");
    vi.doUnmock("@/lib/safety/turnstile");
    vi.unstubAllEnvs();
  });
});

describe("public case requests", () => {
  it("take a network slot before any replay lookup", async () => {
    vi.resetModules();
    vi.stubEnv("USAGE_DATA_FILE", `/tmp/scam-scout-cases-test-${process.pid}-${Date.now()}.json`);
    vi.doMock("@/auth", () => ({ auth: async () => null }));
    const lookup = vi.fn(async () => null);
    vi.doMock("@/lib/replay/cache", async (load) => ({ ...(await load<object>()), getReplay: lookup }));
    const { POST } = await import("@/app/api/cases/route");
    const statuses: number[] = [];
    for (let i = 0; i < 122; i += 1) {
      const res = await POST(new Request("https://scamscout.example/api/cases", { method: "POST", headers: { host: "scamscout.example", origin: "https://scamscout.example", "content-type": "application/json", "x-real-ip": "198.51.100.77" }, body: JSON.stringify({ replayId: `cap_${i}` }) }));
      statuses.push(res.status);
    }
    expect(statuses.slice(120)).toEqual([429, 429]);
    expect(lookup.mock.calls.length).toBeLessThanOrEqual(120);
    vi.doUnmock("@/lib/replay/cache");
    vi.doUnmock("@/auth");
    vi.unstubAllEnvs();
  });
});

describe("auth posts", () => {
  it("refuse a body past 4 KiB even without a Content-Length", async () => {
    vi.resetModules();
    vi.stubEnv("USAGE_DATA_FILE", `/tmp/scam-scout-auth-test-${process.pid}-${Date.now()}.json`);
    const post = vi.fn(async () => new Response("ok"));
    vi.doMock("@/auth", () => ({ handlers: { GET: vi.fn(), POST: post } }));
    const { POST } = await import("@/app/api/auth/[...nextauth]/route");
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(10_000))); controller.close(); } });
    const headers = { host: "scamscout.example", origin: "https://scamscout.example", "content-type": "application/x-www-form-urlencoded" };
    const big = new Request("https://scamscout.example/api/auth/callback/account", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(big as never)).status).toBe(413);
    expect(post).not.toHaveBeenCalled();
    const small = new Request("https://scamscout.example/api/auth/callback/account", { method: "POST", headers, body: "username=a&password=b" });
    expect((await POST(small as never)).status).toBe(200);
    expect((await POST(new Request("https://scamscout.example/api/auth/callback/account", { method: "POST", headers: { ...headers, origin: "https://evil.example" }, body: "a=b" }) as never)).status).toBe(403);
    vi.doUnmock("@/auth");
    vi.unstubAllEnvs();
  });
});

describe("a failed check", () => {
  it("streams neutral copy and keeps the internal error out of the frame", async () => {
    const { caseFailedFrame } = await import("@/lib/case/sse");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const frame = caseFailedFrame(new Error("limit_config:REPORT_RETENTION_DAYS tvly-secret-0001"), 7, ["tvly-secret-0001"]);
    expect(frame).toContain("The check could not finish. Try again.");
    expect(frame).not.toMatch(/limit_config|tvly-secret/);
    expect(String(log.mock.calls[0])).not.toContain("tvly-secret-0001");
    log.mockRestore();
  });
});
