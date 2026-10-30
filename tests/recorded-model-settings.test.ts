import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each(["json", "sse-id", "sse-input"])("serves generated recorded %s with unpriced live models", async (format) => {
  for (const key of ["MODEL_ROUTER", "MODEL_EXTRACT", "MODEL_VISION", "MODEL_JUDGE"]) vi.stubEnv(key, "unlisted/model");
  vi.resetModules();
  if (format === "json") {
    const { GET } = await import("@/app/api/replays/[id]/route");
    const response = await GET(new Request("https://site.example/api/replays/quantum-yield"), { params: Promise.resolve({ id: "quantum-yield" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).report.verdict.level).toBe("High");
  } else {
    const { POST } = await import("@/app/api/cases/route");
    const stream = await POST(new Request("https://site.example/api/cases", {
      method: "POST", headers: { origin: "https://site.example", "content-type": "application/json" },
      body: JSON.stringify(format === "sse-id" ? { replayId: "quantum-yield" } : { input: "quantumyield.example" }),
    }));
    expect(stream.status).toBe(200);
    const frames = (await stream.text()).split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    expect(frames).toContainEqual(expect.objectContaining({ type: "mode.replay", payload: { badge: "Replay", message: "Recorded case." } }));
    expect(frames.some((frame) => frame.type === "case.done" && frame.payload.report.verdict.level === "High")).toBe(true);
  }
});
