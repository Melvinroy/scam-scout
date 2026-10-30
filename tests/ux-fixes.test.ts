import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Budget } from "@/lib/agent/budget";
import { runInvestigation } from "@/lib/agent/machine";
import { emptyCase, reduceCase, type CaseView } from "@/lib/case/reducer";
import { budgetDefaults } from "@/lib/config";
import type { LlmProvider, RdapProvider, ResearchProvider, ScreenshotProvider } from "@/lib/providers/types";
import type { Evidence, RedFlag } from "@/lib/types";

const shown = vi.hoisted(() => ({ view: null as CaseView | null }));
vi.mock("@/lib/state/stores", () => ({ useCase: () => shown.view }));
const { LiveSheet } = await import("@/components/hud/LiveSheet");

async function investigateWithoutRdapDate() {
  const research: ResearchProvider = {
    async search() { return { results: [], credits: 1 }; },
    async extract() { return { pages: [], failed: [], credits: 1 }; },
    async map() { return { urls: [], credits: 1 }; },
    async crawl() { return { pages: [], credits: 1 }; },
  };
  const rdap: RdapProvider = { async lookup(domain) { return { domain, ageDays: null }; } };
  const screenshots: ScreenshotProvider = { async capture() { return { skipped: true }; } };
  const llm: LlmProvider = { live: false, async complete() { return { json: {}, text: "", model: "nvidia/Nemotron-3_5-Lightning", tokens: { in: 0, out: 0 } }; } };
  const generator = runInvestigation({ raw: "example.com", mode: "replay", replayReason: "recorded_fixture", deps: { research, rdap, screenshots, llm, budget: new Budget(budgetDefaults()) } });
  let view = emptyCase();
  let step = await generator.next();
  while (!step.done) {
    view = reduceCase(view, step.value);
    step = await generator.next();
  }
  return { report: step.value, view };
}

describe("check results", () => {
  it("does not cite an RDAP record that has no registration date", async () => {
    const { report, view } = await investigateWithoutRdapDate();
    for (const evidence of [...report.evidence, ...view.evidence]) {
      expect(evidence.source_type).not.toBe("rdap");
      expect(evidence.quote).not.toMatch(/no registration date/i);
    }
  });

  it("labels a signal that lowers the score instead of printing its negative points", () => {
    const evidence: Evidence = { evidence_id: "ev_reg", url: "https://register.example/1", title: "Register entry", source_type: "regulator", source_domain: "register.example", quote: "Listed.", call_id: "c1" } as Evidence;
    const mitigation: RedFlag = { signal_id: "M1", title: "Listed on an official register", weight: -30, confidence: 0.98, source_reliability: 1, points: -29, typologies: [], status: "active", evidence_ids: ["ev_reg"], explanation: "Listed.", hard: false, category: "mitigation" };
    shown.view = { ...emptyCase(), mode: "done", input: "example.com", evidence: [evidence], mitigations: [mitigation] } as CaseView;
    const html = renderToStaticMarkup(createElement(LiveSheet));
    expect(html).toContain("Listed on an official register");
    expect(html).toContain("Lowers risk");
    expect(html).not.toContain("-29");
  });

  it("labels a zero-point signal as no change, not as lowering risk", () => {
    const evidence = { evidence_id: "ev_z", url: "https://example.com/", title: "Page", source_type: "own_site", source_domain: "example.com", quote: "Seen.", call_id: "c1" } as Evidence;
    const neutral: RedFlag = { signal_id: "S9", title: "Checked with no effect", weight: 10, confidence: 0, source_reliability: 1, points: 0, typologies: [], status: "active", evidence_ids: ["ev_z"], explanation: "Seen.", hard: false, category: "other" } as RedFlag;
    shown.view = { ...emptyCase(), mode: "done", input: "example.com", evidence: [evidence], flags: [neutral] } as CaseView;
    const html = renderToStaticMarkup(createElement(LiveSheet));
    expect(html).toContain("Checked with no effect");
    expect(html).toContain("No change");
    expect(html).not.toContain("Lowers risk");
  });
});

describe("shared counters", () => {
  it("refuse with a neutral 503 on a hosted instance without the shared store", async () => {
    vi.resetModules();
    const saved = { ...process.env };
    process.env.VERCEL = "1";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.USAGE_DATA_FILE = "/tmp/ux-instance-local.json";
    try {
      const { throttleHourly } = await import("@/lib/http/throttle");
      const res = await throttleHourly("t", ["ip:1"], 5);
      expect(res?.status).toBe(503);
      expect(JSON.stringify(await res?.json())).not.toMatch(/redis|store|limit/i);
    } finally {
      process.env = saved;
      vi.resetModules();
    }
  });
});

describe("throttle counter failures", () => {
  it("refuse with a neutral 503 when a counter call fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/abuse/store", () => ({ readyUsageStore: async () => ({ reserveCount: async () => { throw new Error("redis down"); } }) }));
    try {
      const { throttleHourly } = await import("@/lib/http/throttle");
      const res = await throttleHourly("t", ["ip:1"], 5);
      expect(res?.status).toBe(503);
    } finally {
      vi.doUnmock("@/lib/abuse/store");
      vi.resetModules();
    }
  });
});
