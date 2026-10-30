import { describe, expect, it, vi } from "vitest";
import { Budget } from "@/lib/agent/budget";
import { runInvestigation } from "@/lib/agent/machine";
import { budgetDefaults } from "@/lib/config";
import { matchFixture } from "@/fixtures/cases";
import { createFixtureLlm, createFixtureRdap, createFixtureResearch, createFixtureScreenshots } from "@/lib/providers/fixture";
import type { CaseReport } from "@/lib/types";

async function investigate(raw: string, context = ""): Promise<{ report: CaseReport; calls: string[] }> {
  const fixture = matchFixture(raw);
  if (!fixture) throw new Error(`No fixture for ${raw}`);
  const calls: string[] = [];
  const generator = runInvestigation({
    raw,
    context,
    mode: "replay",
    replayReason: "test",
    caseId: fixture.id,
    deps: {
      research: createFixtureResearch(fixture),
      rdap: createFixtureRdap(fixture),
      screenshots: createFixtureScreenshots(fixture),
      llm: createFixtureLlm(fixture, (task) => calls.push(task)),
      budget: new Budget(budgetDefaults()),
    },
  });
  let step = await generator.next();
  while (!step.done) step = await generator.next();
  return { report: step.value, calls };
}

describe("fixture investigations", () => {
  it("scores the synthetic investment pitch High", async () => {
    const { report, calls } = await investigate("quantumyield.example", "User says this is an investment platform.");
    expect(report.verdict.level, flagDump(report)).toBe("High");
    expect(report.verdict.score).toBeGreaterThanOrEqual(60);
    expect(report.verdict.hard_triggers).toContain("R1");
    expect(report.verdict.primary_typology).toBe("investment_scam");
    expect(report.red_flags.some((flag) => flag.signal_id === "I1")).toBe(true);
    expect(report.memo).toMatch(/Decision support only/);
    expect(report.evidence.length).toBeGreaterThan(3);
    expect(calls).toEqual(expect.arrayContaining(["normalize", "plan", "vision", "adjudicate", "memo"]));
  });

  it("scores the synthetic shop Medium", async () => {
    const { report } = await investigate("brightparcel.example");
    expect(report.verdict.level, flagDump(report)).toBe("Medium");
    expect(report.verdict.score).toBeGreaterThanOrEqual(30);
    expect(report.verdict.score).toBeLessThan(60);
    expect(report.verdict.primary_typology).toBe("fake_shop");
    expect(report.verdict.hard_triggers).toHaveLength(0);
  });

  it("scores the synthetic licensed firm Low", async () => {
    const { report } = await investigate("heliosremit.example");
    expect(report.verdict.level, flagDump(report)).toBe("Low");
    expect(report.verdict.score).toBeLessThan(30);
    expect(report.mitigations.some((flag) => flag.signal_id === "M1" || flag.signal_id === "M4")).toBe(true);
    expect(report.verdict.manual_review).toBe(false);
  });

  it("scores the lookalike domain High as impersonation", async () => {
    const { report } = await investigate("https://meridian-bank-alert.example/verify");
    expect(report.verdict.level, flagDump(report)).toBe("High");
    expect(report.verdict.primary_typology).toBe("impersonation");
    expect(report.red_flags.some((flag) => flag.signal_id === "V1" || flag.signal_id === "S6")).toBe(true);
  });

  it("scores the phone payee Medium as an APP mule", async () => {
    const { report } = await investigate("+65 8123 4409", "Marketplace seller asked me to pay their personal account. Payee Jordan Lee.");
    expect(report.verdict.level, flagDump(report)).toBe("Medium");
    expect(report.verdict.primary_typology).toBe("app_mule");
    expect(report.red_flags.some((flag) => flag.signal_id === "P1")).toBe(true);
  });

  it("leaves the established bookshop unverified when the only mitigation is a review page", async () => {
    const { report } = await investigate("harbourpine.example");
    expect(report.verdict.level, flagDump(report)).toBe("Not enough evidence");
    expect(report.verdict.unverified).toBe(true);
    expect(report.mitigations.some((flag) => flag.signal_id === "M2")).toBe(true);
    expect(report.verdict.manual_review).toBe(false);
  });
});

function flagDump(report: CaseReport): string {
  return JSON.stringify(
    {
      score: report.verdict.score,
      level: report.verdict.level,
      confidence: report.verdict.confidence,
      typology: report.verdict.primary_typology,
      hard: report.verdict.hard_triggers,
      flags: [...report.red_flags, ...report.mitigations].map((flag) => [flag.signal_id, flag.points]),
    },
    null,
    2,
  );
}

it.each(["evidence", "adjudicate"])("returns available evidence and a finished report when the deadline expires during %s", async (phase) => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const fixture = matchFixture("harbourpine.example")!;
  const calls: string[] = [];
  const generator = runInvestigation({ raw: "harbourpine.example", mode: "replay", deps: {
    research: createFixtureResearch(fixture), rdap: createFixtureRdap(fixture),
    screenshots: createFixtureScreenshots(fixture),
    llm: createFixtureLlm(fixture, (task) => {
      calls.push(task);
      if (phase === "adjudicate" && task === "adjudicate") clock.mockReturnValue(now + 45_000);
    }), budget: new Budget(budgetDefaults()),
  } });
  try {
    let step = await generator.next();
    while (!step.done) {
      if (phase === "evidence" && step.value.type === "evidence.added") clock.mockReturnValue(now + 45_000);
      step = await generator.next();
    }
    expect(step.value.evidence.length).toBeGreaterThan(0);
    expect(step.value.memo).not.toBe("");
    expect(calls.includes("adjudicate")).toBe(phase === "adjudicate");
    expect(calls).not.toContain("memo");
  } finally { clock.mockRestore(); }
});
