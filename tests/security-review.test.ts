import { describe, expect, it } from "vitest";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { saveFinishedCase } from "@/lib/case/persist";
import { mentionsKey } from "@/lib/byok";
import { sseFrame } from "@/lib/case/sse";
import { isSameOrigin } from "@/lib/http/origin";
import { assertPublicHttpUrl, fetchPublic, isPrivateIp, pinnedLookup } from "@/lib/safety/ssrf";
import type { AgentEvent, CaseReport } from "@/lib/types";

const publicLookup = async () => ["93.184.216.34"];

describe("ssrf", () => {
  it("blocks IPv4-mapped IPv6 loopback and private addresses in hex form", () => {
    for (const url of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:a9fe:a9fe]/", "http://[::]/"]) {
      expect(() => assertPublicHttpUrl(url), url).toThrow(/blocked/i);
    }
    expect(assertPublicHttpUrl("http://[::ffff:5db8:d822]/").hostname).toBe("[::ffff:5db8:d822]");
  });

  it("blocks link-local, site-local and multicast IPv6, and leaves global addresses open", () => {
    for (const ip of ["fe80::1", "febf::1", "fec0::1", "feff::1", "ff02::1", "ff0e::1"]) expect(isPrivateIp(ip), ip).toBe(true);
    expect(() => assertPublicHttpUrl("http://[fec0::1]/")).toThrow(/blocked/i);
    for (const ip of ["2606:4700::1111", "fe7f::1"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("connects only to the addresses that passed the check, whatever DNS says later", () => {
    const lookup = pinnedLookup(["93.184.216.34"]);
    const all = new Promise((resolve) => lookup("rebind.example", { all: true }, (_error, records) => resolve(records)));
    const one = new Promise((resolve) => lookup("other.example", {}, (_error, address, family) => resolve([address, family])));
    return Promise.all([all, one]).then(([records, single]) => {
      expect(records).toEqual([{ address: "93.184.216.34", family: 4 }]);
      expect(single).toEqual(["93.184.216.34", 4]);
    });
  });

  it("refuses an https to http redirect, so a key is never sent in clear text", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return new Response(null, { status: 307, headers: { location: "http://api.example/v1" } });
    }) as unknown as typeof fetch;
    await expect(
      fetchPublic("https://api.example/v1", { headers: { authorization: "Bearer k" } }, { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow(/downgrade/i);
    expect(seen).toEqual(["https://api.example/v1"]);
  });

  it("drops credentials when a redirect changes port on the same host", async () => {
    const auth: (string | null)[] = [];
    let hop = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      auth.push(new Headers(init.headers).get("authorization"));
      hop += 1;
      return hop === 1 ? new Response(null, { status: 307, headers: { location: "https://api.example:8443/v1" } }) : new Response("ok");
    }) as unknown as typeof fetch;
    await fetchPublic("https://api.example/v1", { headers: { authorization: "Bearer k" } }, { fetchImpl, lookup: publicLookup });
    expect(auth).toEqual(["Bearer k", null]);
  });
});

describe("saved reports", () => {
  const key = "tvly-user-key-0123456789abcdef";
  it("never store a user key that appears in the input or in provider output", async () => {
    const store = new MemoryUsageStore();
    const report = {
      case_id: "c_key",
      mode: "live",
      input: { raw: `check ${key}` },
      verdict: { label: "High" },
      evidence: [{ snippet: `provider echoed ${key}` }],
    } as unknown as CaseReport;
    await saveFinishedCase(store, report, [key], { raw: `check ${key}`, mode: "live" });
    const saved = JSON.stringify(await store.getReport("c_key"));
    expect(saved).toContain("[redacted]");
    expect(saved).not.toContain(key);
    expect(JSON.stringify(store)).not.toContain(key);
  });
});

describe("streamed events", () => {
  it("never send a user key that a provider echoed into a progress event", () => {
    const key = "nvapi-user-key-0123456789abcdef";
    const event = { case_id: "c1", seq: 3, ts: "2026-10-30T08:00:00.000Z", type: "evidence.added", payload: { quote: `echo ${key}` } } as unknown as AgentEvent;
    const frame = sseFrame(event, [key]);
    expect(frame).not.toContain(key);
    expect(frame).toMatch(/^data: .*\[redacted\].*\n\n$/s);
  });
});

describe("owner form posts", () => {
  const post = (headers: Record<string, string>) => new Request("https://scamscout.example/api/admin/captures/c1/delete", { method: "POST", headers });
  it("accept only a post whose Origin is this site", () => {
    expect(isSameOrigin(post({ origin: "https://scamscout.example" }))).toBe(true);
    expect(isSameOrigin(post({ origin: "https://evil.scamscout.example" }))).toBe(false);
    expect(isSameOrigin(post({ origin: "null" }))).toBe(false);
    expect(isSameOrigin(post({}))).toBe(false);
    const proxied = (origin: string) => new Request("http://10.0.0.5:3000/api/admin/captures/c1/delete", { method: "POST", headers: { origin, "x-forwarded-host": "scamscout.example", "x-forwarded-proto": "https" } });
    expect(isSameOrigin(proxied("https://scamscout.example"))).toBe(true);
    expect(isSameOrigin(proxied("https://evil.example"))).toBe(false);
    expect(isSameOrigin(proxied("http://scamscout.example"))).toBe(false);
  });
});

describe("key in the subject", () => {
  it("is found only when the user's own key is there, not the literal [redacted]", () => {
    const key = "tvly-user-key-0123456789abcdef";
    expect(mentionsKey(`look up ${key}`, [key])).toBe(true);
    expect(mentionsKey("a page that says [redacted]", [])).toBe(false);
    expect(mentionsKey("a page that says [redacted]", [key])).toBe(false);
  });
});

describe("private address ranges", () => {
  it("apply to IP literals, not to public hostnames that start with fc or fd", async () => {
    const { isPrivateIp, assertPublicHttpUrl } = await import("@/lib/safety/ssrf");
    expect(isPrivateIp("fd-health.example")).toBe(false);
    expect(isPrivateIp("fc-office.example")).toBe(false);
    expect(() => assertPublicHttpUrl("https://fd-health.example/")).not.toThrow();
    expect(() => assertPublicHttpUrl("https://fc-office.example/")).not.toThrow();
    for (const ip of ["fd00::1", "fc00::1", "fe80::1", "::1", "127.0.0.1", "10.1.2.3", "169.254.169.254", "::ffff:127.0.0.1", "[fd12::3]"]) expect(isPrivateIp(ip), ip).toBe(true);
    expect(() => assertPublicHttpUrl("http://[fd00::1]/")).toThrow();
  });
});

describe("provider base URLs", () => {
  it("require HTTPS when deployed and allow HTTP for local test servers", async () => {
    const { nebiusBaseUrl, tavilyBaseUrl } = await import("@/lib/config");
    expect(() => nebiusBaseUrl({ VERCEL_ENV: "production", NEBIUS_BASE_URL: "http://api.example/v1" } as unknown as NodeJS.ProcessEnv)).toThrow(/HTTPS/);
    expect(() => tavilyBaseUrl({ VERCEL_ENV: "preview", TAVILY_BASE_URL: "http://api.example" } as unknown as NodeJS.ProcessEnv)).toThrow(/HTTPS/);
    expect(nebiusBaseUrl({ VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe("https://api.tokenfactory.nebius.com/v1/");
    expect(() => nebiusBaseUrl({ NODE_ENV: "production", NEBIUS_BASE_URL: "http://api.example/v1" } as unknown as NodeJS.ProcessEnv)).toThrow(/HTTPS/);
    expect(tavilyBaseUrl({ TAVILY_BASE_URL: "http://127.0.0.1:9" } as unknown as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:9");
  });
});
