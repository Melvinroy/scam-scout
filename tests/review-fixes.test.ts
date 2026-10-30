import { describe, expect, it } from "vitest";
import { authorizeLive } from "@/lib/abuse/gate";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { hostedSecrets, scrubSecrets } from "@/lib/byok";
import { reduceCase, emptyCase, runningCase } from "@/lib/case/reducer";
import { generationStillCurrent } from "@/lib/client/demo-guard";
import { nextEventSeq, readSse } from "@/lib/client/pump";
import { clientIp, cookieSecure, humanCookieValue, readHumanCookie, redirectSeeOther } from "@/lib/http/cookies";
import { requireAuthSecret } from "@/lib/safety/auth-secret";
import type { AgentEvent } from "@/lib/types";

describe("review fixes", () => {
  it("fails startup when AUTH_SECRET is missing and refuses the known fallback", () => {
    expect(() => requireAuthSecret({ ...process.env, AUTH_SECRET: "" })).toThrow(/AUTH_SECRET is required/);
    expect(() => requireAuthSecret({ ...process.env, AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET is required/);
    expect(requireAuthSecret({ ...process.env, AUTH_SECRET: "desk-secret" })).toBe("desk-secret");
  });

  it("redirects the captures desk to a relative path so the browser host is unchanged", () => {
    const response = redirectSeeOther("/admin/captures");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/captures");
    expect(() => redirectSeeOther("https://evil.example")).toThrow(/redirect path/);
    expect(() => redirectSeeOther("//evil.example")).toThrow(/redirect path/);
  });

  it("keeps the bot-check cookie on http and marks it secure behind https", () => {
    const httpRequest = new Request("http://127.0.0.1:3210/api/human");
    const httpsRequest = new Request("https://scamscout.example/api/human", { headers: { "x-forwarded-proto": "https" } });
    const spoofed = new Request("http://127.0.0.1:3210/api/human", { headers: { "x-forwarded-proto": "https" } });
    expect(cookieSecure(httpRequest)).toBe(false);
    expect(cookieSecure(httpsRequest)).toBe(true);
    expect(cookieSecure(spoofed)).toBe(false);
  });

  it("uses the platform IP and ignores a spoofed forwarding hop", () => {
    const platform = new Request("https://scamscout.example/api/cases", {
      headers: { "x-forwarded-for": "198.51.100.4", "x-vercel-forwarded-for": "203.0.113.9, 198.51.100.1" },
    });
    expect(clientIp(platform)).toBe("203.0.113.9");
    const spoofed = new Request("https://scamscout.example/api/cases", {
      headers: { "x-forwarded-for": "198.51.100.4", "x-real-ip": "203.0.113.8" },
    });
    expect(clientIp(spoofed, { NODE_ENV: "production" })).toBe("0.0.0.0");
    expect(clientIp(spoofed, { NODE_ENV: "development" })).toBe("203.0.113.8");
  });

  it("binds the human cookie to the signed-in user", () => {
    const previous = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "desk-secret";
    try {
      const token = humanCookieValue("owner_1");
      expect(readHumanCookie(token ?? undefined, "owner_1")).toBe(true);
      expect(readHumanCookie(token ?? undefined, "other_user")).toBe(false);
      expect(readHumanCookie(token ?? undefined, undefined)).toBe(false);
      expect(humanCookieValue("")).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = previous;
    }
  });

  it("redacts hosted keys from an error string", () => {
    const env = {
      ...process.env,
      TAVILY_API_KEY: "tvly-hosted-secret",
      NEBIUS_API_KEY: "nvapi-hosted-secret",
      TURNSTILE_SECRET_KEY: "turnstile-secret-value",
      AUTH_SECRET: "auth-secret-value",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token-value",
      AUTH_GOOGLE_SECRET: "google-auth-secret",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
    };
    const secrets = hostedSecrets(env, ["tvly-visitor-key"]);
    const text = scrubSecrets(
      "tvly-hosted-secret nvapi-hosted-secret turnstile-secret-value auth-secret-value upstash-token-value google-auth-secret google-client-secret tvly-visitor-key",
      secrets,
    );
    expect(text).not.toContain("tvly-hosted-secret");
    expect(text).not.toContain("nvapi-hosted-secret");
    expect(text).not.toContain("turnstile-secret-value");
    expect(text).not.toContain("auth-secret-value");
    expect(text).not.toContain("upstash-token-value");
    expect(text).not.toContain("google-auth-secret");
    expect(text).not.toContain("google-client-secret");
    expect(text).not.toContain("tvly-visitor-key");
  });

  it("keeps the owner gate closed unless the quota path is requested", async () => {
    const store = new MemoryUsageStore();
    const closed = await authorizeLive({
      userId: "user_1",
      human: true,
      keysConfigured: true,
      ip: "203.0.113.8",
      deviceId: "device-a",
      userAgent: "TestAgent",
      store,
      limits: { accountAllowance: 3, ipDailyCap: 8, deviceDailyCap: 8, ratePerHour: 5, dailyCreditCap: 400, creditsPerLiveCase: 16 },
    });
    expect(closed).toMatchObject({ mode: "replay", reason: "live_invite_only" });
    expect((await store.getAccount("user_1")).used).toBe(0);
  });

  it("applies a failure frame after earlier events and reads a final SSE chunk", async () => {
    let view = reduceCase(emptyCase(), event(1, "case.started", { input: "Harbour" }));
    view = reduceCase(view, event(1, "case.done", { error: "stopped" }));
    expect(view.error).toBeUndefined();
    expect(view.mode).toBe("running");
    view = reduceCase(view, event(nextEventSeq(1), "case.done", { error: "stopped" }));
    expect(view.mode).toBe("done");
    expect(view.error).toBe("stopped");

    const received: AgentEvent[] = [];
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"case_id":"c","seq":2,"ts":"","type":"case.done","payload":{"error":"stopped"}}\n'));
        controller.close();
      },
    });
    await readSse(new Response(body), (item) => received.push(item));
    expect(received.map((item) => item.type)).toEqual(["case.done"]);
  });

  it("clears a stale verdict when a run starts and ignores a stale replay generation", () => {
    const stale = { ...emptyCase(), mode: "done" as const, verdict: { level: "High" as const, score: 80, confidence: "Low" as const, label: "High", hard_triggers: ["R1"], primary_typology: null, secondary_typology: null, budget_exhausted: false, degraded: false, radar: { investment_scam: 0, fake_shop: 0, impersonation: 0, app_mule: 0 }, manual_review: false }, error: "old", report: { case_id: "old" } as never };
    const next = { ...stale, ...runningCase("Harbour Desk") };
    expect(next.mode).toBe("running");
    expect(next.verdict).toBeUndefined();
    expect(next.error).toBeUndefined();
    expect(next.report).toBeUndefined();
    expect(next.label).toBe("Harbour Desk");
    expect(generationStillCurrent(1, 1)).toBe(true);
    expect(generationStillCurrent(1, 2)).toBe(false);
  });
});

function event(seq: number, type: AgentEvent["type"], payload: Record<string, unknown>): AgentEvent {
  return { case_id: "c", seq, ts: "", type, payload };
}
