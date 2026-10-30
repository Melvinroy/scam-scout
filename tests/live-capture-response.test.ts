import { expect, it, vi } from "vitest";
import { MemoryUsageStore } from "@/lib/abuse/store";
import { readSse } from "@/lib/client/pump";
import { FIXTURES } from "@/fixtures/cases";
import { fixtureDeps } from "@/lib/providers/runtime";
import { renderMemo } from "@/lib/agent/memo";
import { publicPayload } from "@/lib/replay/public";

const mocks = vi.hoisted(() => ({ report: null as unknown, events: [] as unknown[], store: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u", email: "reader@example.com" } }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/abuse/store", async (load) => ({ ...await load<object>(), readyUsageStore: async () => mocks.store }));
vi.mock("@/lib/abuse/gate", async (load) => ({ ...await load<object>(), authorizeLive: async () => ({ ok: true, mode: "live", reason: "byok" }) }));
vi.mock("@/lib/providers/runtime", async (load) => ({ ...await load<object>(), liveDeps: vi.fn() }));
vi.mock("@/lib/agent/machine", async (load) => ({ ...await load<object>(), runInvestigation: async function* () { yield* mocks.events; return mocks.report; } }));

it("carries the live handler capture through the client SSE download path with safe report and events", async () => {
  const machine = await vi.importActual<typeof import("@/lib/agent/machine")>("@/lib/agent/machine");
  const fixture = FIXTURES[0];
  const run = machine.runInvestigation({ raw: fixture.domain!, mode: "live", deps: fixtureDeps(fixture) });
  mocks.events = [];
  let step = await run.next();
  while (!step.done) { mocks.events.push(step.value); step = await run.next(); }
  const incomplete = { ...step.value, verdict: { ...step.value.verdict, budget_exhausted: true } };
  incomplete.memo = renderMemo(incomplete);
  expect(incomplete.memo).toContain("Some checks remain incomplete.");
  expect(incomplete.memo).not.toMatch(/budget|tokens?|cost|spend/i);
  mocks.report = incomplete;
  mocks.store = new MemoryUsageStore();
  const { POST } = await import("@/app/api/cases/route");
  const response = await POST(new Request("https://site.example/api/cases", {
    method: "POST", headers: { origin: "https://site.example", "content-type": "application/json" },
    body: JSON.stringify({ live: true, input: fixture.domain, researchKey: "tvly-test-placeholder", modelKey: "test-placeholder" }),
  }));
  expect(response.status).toBe(200);
  let download = "";
  await readSse(response, (event) => {
    if (event.type === "capture.saved" && event.payload.capture) download = JSON.stringify(event.payload.capture, null, 2);
  });
  expect(download).not.toBe("");
  const capture = JSON.parse(download);
  expect(capture.report).toEqual(publicPayload(mocks.report));
  expect(capture.events).toEqual(publicPayload(mocks.events));
  expect(capture.report.evidence.length).toBeGreaterThan(0);
  expect(download).not.toMatch(/ownerEmail|tavilyCredits|nebiusUsd|budget_exhausted|"costs"|"tokens"/);
});
