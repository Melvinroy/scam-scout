import { beforeEach, expect, it, vi } from "vitest";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { PUBLIC_READS_PER_HOUR, PUBLIC_PAGES_PER_HOUR } from "@/lib/http/throttle";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), store: null as unknown, lookup: vi.fn(), authGet: vi.fn(), authPost: vi.fn(), meta: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth, handlers: { GET: mocks.authGet, POST: mocks.authPost } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/lib/abuse/store", async (load) => ({ ...await load<object>(), readyUsageStore: async () => mocks.store }));
vi.mock("@/lib/replay/cache", async (load) => ({ ...await load<object>(), getReplay: mocks.lookup, presetMeta: mocks.meta }));
import { GET as session } from "@/app/api/session/route";
import { GET as health } from "@/app/api/health/route";
import { GET as presets } from "@/app/api/replays/route";
import { GET as replay } from "@/app/api/replays/[id]/route";
import { POST as cases } from "@/app/api/cases/route";
import { POST as human } from "@/app/api/human/route";
import { POST as invites } from "@/app/api/invites/route";
import { NextRequest } from "next/server";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import { publicPayload } from "@/lib/replay/public";
import { readFileSync } from "node:fs";
import { trademarkMatches } from "@/scripts/trademark-scan.mjs";

const banned = /budget|exhausted|credits|tokens?|usd|cost|spend|quota|role|liveOwner|liveConfigured|live_invite_only|model_unpriced|turnstile_|dev_bypass|limit/i;
function scan(value: unknown): void {
  if (typeof value === "string") expect(value).not.toMatch(banned);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    expect(key).not.toMatch(banned);
    scan(item);
  }
}
const request = (path: string, body?: unknown) => new Request(`https://site.example/api/${path}`, body === undefined ? {} : {
  method: "POST", headers: { origin: "https://site.example", "content-type": "application/json" }, body: JSON.stringify(body),
});
// Model Next's proxy handoff: only a continuation response dispatches the handler.
async function dispatch(request: NextRequest, handler: () => Promise<unknown>) {
  const { proxy } = await import("@/proxy");
  const response = await proxy(request);
  if (response.headers.get("x-middleware-next") !== "1") return response;
  await handler();
  return new Response(null);
}
const context = { params: Promise.resolve({ id: "recorded" }) };
beforeEach(async () => {
  mocks.store = new MemoryUsageStore();
  mocks.auth.mockReset();
  mocks.auth.mockResolvedValue(null);
  mocks.authGet.mockReset();
  mocks.authGet.mockImplementation(async () => Response.json(await mocks.auth()));
  mocks.meta.mockReset();
  const cache = await vi.importActual<typeof import("@/lib/replay/cache")>("@/lib/replay/cache");
  mocks.meta.mockImplementation(cache.presetMeta);
  mocks.lookup.mockReset();
  mocks.lookup.mockResolvedValue({ id: "recorded", events: [{ case_id: "recorded", seq: 1, ts: "", type: "mode.replay", payload: { reason: "live_invite_only", credits: 4, tokens: 10, usd: 1, unknown_private_field: true } }], report: { costs: { usd: 1 } } });
});
it("allowlists fields and neutralizes internal codes, including unknown future fields", () => {
  const result = publicPayload({ case_id: "c", unknown_private_field: "private", reason: "live_invite_only", error: "model_unpriced", costs: { usd: 1 } });
  scan(result);
  expect(result).not.toHaveProperty("unknown_private_field");
  expect(result).not.toHaveProperty("reason");
  expect(result).toHaveProperty("error", "unavailable");
});
it("scans anonymous and signed-in public JSON responses", async () => {
  for (const identity of [null, { user: { id: "u", name: "Reader", email: "reader@example.com", role: "owner" } }]) {
    mocks.auth.mockResolvedValue(identity);
    for (const response of [await session(request("session")), await health(request("health")), await presets(request("replays")), await authGet(new NextRequest("https://site.example/api/auth/session")), await replay(request("replays/recorded"), context), await cases(request("cases", {})), await human(request("human", {})), await invites(request("invites", { code: "invalid" }))]) scan(await response.json());
  }
});
it("sanitizes cached replay SSE on both replay branches", async () => {
  for (const body of [{ replayId: "recorded" }, { input: "harbourpine.example" }]) {
    const response = await cases(request("cases", body));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    for (const line of (await response.text()).split("\n").filter((line) => line.startsWith("data: "))) scan(JSON.parse(line.slice(6)));
  }
});
it("keeps prohibited names and query previews out of every recorded API and SSE response", async () => {
  const cache = await vi.importActual<typeof import("@/lib/replay/cache")>("@/lib/replay/cache");
  const terms = readFileSync("scripts/trademark-denylist.txt", "utf8").split(/\r?\n/).filter((term) => term && !term.startsWith("#"));
  for (const { id } of cache.presetMeta()) {
    mocks.lookup.mockResolvedValue(await cache.getReplay(id));
    const json = await replay(request(`replays/${id}`), { params: Promise.resolve({ id }) });
    const sse = await cases(request("cases", { replayId: id }));
    expect(json.status).toBe(200);
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    for (const body of [await json.text(), await sse.text()]) {
      expect(trademarkMatches(body, terms), id).toEqual([]);
      expect(body).not.toMatch(/args_preview|"query"/);
    }
  }
});
it("stops replay GET floods before further store lookups", async () => {
  const statuses = [];
  for (let i = 0; i < 120 + 30; i++) statuses.push((await replay(request("replays/recorded"), context)).status);
  expect(statuses.filter((status) => status === 429)).toHaveLength(30);
  expect(mocks.lookup).toHaveBeenCalledTimes(120);
});
it("throttles the case page lookup before touching the store", async () => {
  const { default: CasePage } = await import("@/app/case/[id]/page");
  const cache = await vi.importActual<typeof import("@/lib/replay/cache")>("@/lib/replay/cache");
  mocks.lookup.mockResolvedValue(await cache.getReplay("quantum-yield"));
  const responses = [];
  for (let i = 0; i < PUBLIC_PAGES_PER_HOUR + 30; i++) {
    const response = await dispatch(new NextRequest(`https://site.example/case/missing-${i}`),
      () => CasePage({ params: Promise.resolve({ id: `missing-${i}` }) }));
    responses.push(response.status);
  }
  expect(responses.filter((status) => status === 429)).toHaveLength(30);
  expect(mocks.lookup).toHaveBeenCalledTimes(PUBLIC_PAGES_PER_HOUR);
});
it("scans successful human and invite responses without returning counters or verification codes", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "u" } });
  vi.stubEnv("AUTH_SECRET", "public-schema-test-signing-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("INVITE_CODES", "TEST-ACCESS:2");
  try {
    const response = await invites(request("invites", { code: "TEST-ACCESS" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const verification = await human(request("human", { token: "test" }));
    expect(verification.status).toBe(200);
    const verified = await verification.json();
    scan(verified);
    expect(verified).toEqual({ ok: true });
  } finally {
    vi.unstubAllEnvs();
  }
});
it("keeps recorded reports usable across repeated cached JSON and SSE responses", async () => {
  const cache = await vi.importActual<typeof import("@/lib/replay/cache")>("@/lib/replay/cache");
  const pack = await cache.getReplay("harbour-pine");
  mocks.lookup.mockResolvedValue(pack);
  for (let i = 0; i < 2; i++) {
    const json = await (await replay(request("replays/harbour-pine"), context)).json();
    scan(json);
    expect(json.report.verdict.level).toBe(pack?.report.verdict.level);
    expect(json.report.evidence).toHaveLength(pack?.report.evidence.length ?? 0);
    expect(json.report.memo).toBe(pack?.report.memo);
    const stream = await cases(request("cases", { replayId: "harbour-pine" }));
    for (const line of (await stream.text()).split("\n").filter((line) => line.startsWith("data: "))) scan(JSON.parse(line.slice(6)));
  }
});
it("keeps internal replay reasons out of generated fallback SSE", async () => {
  vi.stubEnv("LIVE_MODE_ENABLED", "false");
  try {
    const response = await cases(request("cases", { live: true, input: "harbourpine.example" }));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const frames = (await response.text()).split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    expect(frames.some((frame) => frame.type === "mode.replay")).toBe(true);
    for (const frame of frames) scan(frame);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("removes operational state recursively", () => {
  const result = publicPayload({ type: "budget.update", payload: { steps: 4, pages: 2, screenshots: 1, exhausted: true, budget: 5, tokens: 6, cost: 2, spend: 3 } });
  expect(result.payload).toEqual({});
});
it("stops public GET floods before authentication or preset work", async () => {
  for (const [path, handler] of [["session", session], ["health", health], ["replays", presets], ["auth/session", authGet]] as const) {
    mocks.store = new MemoryUsageStore();
    mocks.auth.mockClear();
    mocks.authGet.mockClear();
    mocks.meta.mockClear();
    const responses = [];
    for (let i = 0; i < PUBLIC_READS_PER_HOUR + 2; i++) responses.push(await handler(new NextRequest(`https://site.example/api/${path}`)));
    expect(responses.slice(PUBLIC_READS_PER_HOUR).map((response) => response.status)).toEqual([429, 429]);
    if (path === "replays") expect(mocks.meta).toHaveBeenCalledTimes(PUBLIC_READS_PER_HOUR);
    if (path === "session") expect(mocks.auth).toHaveBeenCalledTimes(PUBLIC_READS_PER_HOUR);
    if (path === "auth/session") expect(mocks.authGet).toHaveBeenCalledTimes(PUBLIC_READS_PER_HOUR);
  }
});
it("throttles anonymous and invalid submissions before auth and body reads", async () => {
  for (const handler of [invites, human]) for (const identity of [null, { user: { id: "u" } }]) {
    mocks.store = new MemoryUsageStore();
    mocks.auth.mockClear();
    mocks.auth.mockResolvedValue(identity);
    let last: Response | undefined;
    for (let i = 0; i < 32; i++) last = await handler(request("submit", { code: "", token: "" }));
    expect(last?.status).toBe(429);
    expect(mocks.auth.mock.calls.length).toBeLessThanOrEqual(30);
    const blocked = request("submit", {});
    const read = vi.spyOn(blocked.body!, "getReader");
    expect((await handler(blocked)).status).toBe(429);
    expect(read).not.toHaveBeenCalled();
  }
});
it("throttles public page prefetch requests", async () => {
  const { proxy, config } = await import("@/proxy");
  expect(JSON.stringify(config)).not.toContain("missing");
  for (let i = 0; i < PUBLIC_PAGES_PER_HOUR; i++) await proxy(new NextRequest("https://site.example/", { headers: { purpose: "prefetch" } }));
  expect((await proxy(new NextRequest("https://site.example/"))).status).toBe(429);
});

it("projects Auth.js session GET and POST responses while preserving session cookies", async () => {
  const expires = "2026-11-01T00:00:00.000Z";
  for (const handler of [authGet, authPost]) {
    for (const identity of [null, { user: { id: "u", name: "Reader", email: "reader@example.com", image: null, role: "owner" }, expires, internal: true }]) {
      const upstream = () => Response.json(identity, { headers: { "set-cookie": "session=test; HttpOnly", "cache-control": "no-cache" } });
      mocks.authGet.mockImplementation(upstream);
      mocks.authPost.mockImplementation(upstream);
      const response = await handler(new NextRequest("https://site.example/api/auth/session", handler === authPost ? {
        method: "POST", headers: { origin: "https://site.example", "content-type": "application/json" }, body: "{}",
      } : {}));
      expect(response.headers.get("set-cookie")).toBe("session=test; HttpOnly");
      const body = await response.json();
      scan(body);
      expect(body).toEqual(identity ? { expires, user: { name: "Reader", email: "reader@example.com", image: null } } : null);
      expect(identity?.user.role).toBe(identity ? "owner" : undefined);
    }
  }
});
it("stops Auth.js POST floods before reading a body or invoking Auth.js", async () => {
  mocks.authPost.mockReset();
  mocks.authPost.mockResolvedValue(new Response("ok"));
  const make = () => new NextRequest("https://site.example/api/auth/callback/account", {
    method: "POST", headers: { origin: "https://site.example", "content-type": "application/x-www-form-urlencoded" }, body: "username=test",
  });
  for (let i = 0; i < 30; i++) expect((await authPost(make())).status).toBe(200);
  const blocked = make();
  const read = vi.spyOn(blocked.body!, "getReader");
  expect((await authPost(blocked)).status).toBe(429);
  expect(read).not.toHaveBeenCalled();
  expect(mocks.authPost).toHaveBeenCalledTimes(30);
});

it("passes only presentation values across the demo client boundary", async () => {
  const { default: DemoPage } = await import("@/app/demo/page");
  for (const identity of [null, { user: { email: "reader@example.com", role: "judge" } }]) {
    mocks.auth.mockResolvedValue(identity);
    const page = await DemoPage({ searchParams: Promise.resolve({}) });
    scan(page.props);
    expect(page.props).not.toHaveProperty("liveOwner");
    expect(page.props).toHaveProperty("initialInput");
    expect(page.props).toHaveProperty("availabilityMessage");
  }
});

it("projects recorded case data before passing it to client components", async () => {
  const cache = await vi.importActual<typeof import("@/lib/replay/cache")>("@/lib/replay/cache");
  const pack = await cache.getReplay("quantum-yield");
  mocks.lookup.mockResolvedValue({ ...pack, report: { ...pack!.report, evidence: [{ ...pack!.report.evidence[0], tokens: 12, liveOwner: true }] } });
  const { default: CasePage } = await import("@/app/case/[id]/page");
  const page = await CasePage({ params: Promise.resolve({ id: "quantum-yield" }) });
  const children = page.props.children as { props?: Record<string, unknown> }[];
  const file = children.find((child) => child.props && "evidence" in child.props)!;
  scan(file.props);
});


it("prepares the opening input for a recording outside the preset list", async () => {
  mocks.meta.mockReturnValue([]);
  mocks.lookup.mockResolvedValue({ input: "recorded.example" });
  const { default: DemoPage } = await import("@/app/demo/page");
  const page = await DemoPage({ searchParams: Promise.resolve({ case: "quantum-yield" }) });
  expect(page.props.initialInput).toBe("recorded.example");
});

it("matches and throttles image optimizer requests on flood", async () => {
  const { proxy, config } = await import("@/proxy");
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  const url = "https://site.example/_next/image?url=%2Ficon&w=3840&q=75";
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  for (let i = 0; i < PUBLIC_PAGES_PER_HOUR; i++) {
    const response = await proxy(new NextRequest(url));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  }
  for (let i = 0; i < 3; i++) {
    const response = await proxy(new NextRequest(url));
    expect(response.status).toBe(429);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  }
});

it.each(["GET", "HEAD", "OPTIONS", "POST"])("throttles %s on every page and API before route work", async (method) => {
  const { proxy, config } = await import("@/proxy");
  const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
  const paths = ["/", "/demo", "/case/missing", "/case/missing/opengraph-image", "/api/session", "/api/health", "/api/replays", "/api/replays/missing", "/api/cases", "/api/human", "/api/invites", "/api/auth/session", "/api/admin/captures/missing", "/api/admin/captures/missing/delete", "/api/admin/captures/missing/promote"];
  for (const path of paths) {
    expect(unstable_doesMiddlewareMatch({ config, url: `https://site.example${path}` })).toBe(true);
    mocks.store = new MemoryUsageStore();
    for (let i = 0; i < PUBLIC_PAGES_PER_HOUR; i++) await proxy(new NextRequest(`https://site.example${path}`, { method }));
    for (let i = 0; i < 3; i++) {
      expect((await proxy(new NextRequest(`https://site.example${path}`, { method }))).status).toBe(429);
    }
  }

  const { default: CasePage } = await import("@/app/case/[id]/page");
  const cache = await vi.importActual<typeof import("@/lib/replay/cache")>("@/lib/replay/cache");
  mocks.lookup.mockResolvedValue(await cache.getReplay("quantum-yield"));
  for (const [path, handler, downstream] of [
    ["/case/quantum-yield", () => CasePage({ params: Promise.resolve({ id: "quantum-yield" }) }), mocks.lookup],
    ["/api/session", () => session(new NextRequest("https://site.example/api/session")), mocks.auth],
  ] as const) {
    mocks.store = new MemoryUsageStore();
    downstream.mockClear();
    const makeRequest = () => new NextRequest(`https://site.example${path}`, { method });
    // Positive control: an admitted request really dispatches the page or route.
    expect((await dispatch(makeRequest(), handler)).status).toBe(200);
    expect(downstream).toHaveBeenCalledTimes(1);
    for (let i = 1; i < PUBLIC_PAGES_PER_HOUR; i++) await proxy(makeRequest());
    mocks.lookup.mockClear();
    mocks.auth.mockClear();
    for (let i = 0; i < 3; i++) expect((await dispatch(makeRequest(), handler)).status).toBe(429);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  }
});

it("disables opening playback whenever a query is supplied", async () => {
  const { default: DemoPage } = await import("@/app/demo/page");
  const { recordedReplayMayStart } = await import("@/lib/client/demo-guard");
  for (const q of ["unrelated.example", ""]) {
    const page = await DemoPage({ searchParams: Promise.resolve({ q }) });
    expect(page.props.openingReplay).toBe(false);
    expect(recordedReplayMayStart(page.props.initialInput, false, page.props.initialInput, page.props.openingReplay)).toBe(false);
  }
  const empty = await DemoPage({ searchParams: Promise.resolve({}) });
  expect(empty.props.openingReplay).toBe(false);
  expect(empty.props.initialInput).toBe("");
  const requested = await DemoPage({ searchParams: Promise.resolve({ case: "quantum-yield" }) });
  expect(requested.props.openingReplay).toBe(true);
});

it.each(["spend_limit", "spend_unreadable", "daily_credit", "providers_unconfigured", "owner_daily_cap"])("preserves neutral replay availability through SSE for %s", async (reason) => {
  const { sseFrame } = await import("@/lib/case/sse");
  const { emptyCase, reduceCase } = await import("@/lib/case/reducer");
  const { sheetFromView } = await import("@/lib/ui/live-sheet");
  const event = { case_id: "c", seq: 1, ts: "", type: "mode.replay" as const, payload: { reason } };
  const frame = JSON.parse(sseFrame(event, []).slice(6));
  scan(frame);
  expect(publicPayload(frame)).toEqual(frame);
  expect(frame.payload).not.toHaveProperty("reason");
  expect(sheetFromView(reduceCase(emptyCase(), frame)).chips).toContain("Live checks are temporarily unavailable. Showing a recorded case.");
});

it("rejects unapproved replay messages and keeps the neutral fallback", async () => {
  const { emptyCase, reduceCase } = await import("@/lib/case/reducer");
  const { sheetFromView } = await import("@/lib/ui/live-sheet");
  const frame = publicPayload({ case_id: "c", seq: 1, ts: "", type: "mode.replay" as const, payload: { reason: "private_future_code", message: "private provider details" } });
  expect(frame.payload).toEqual({});
  expect(sheetFromView(reduceCase(emptyCase(), frame)).chips).toContain("Recording");
});
