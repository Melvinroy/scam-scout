import { Budget } from "@/lib/agent/budget";
import { runInvestigation } from "@/lib/agent/machine";
import { readyUsageStore } from "@/lib/abuse/store";
import { isSafeCaptureId, listFixtureCapturePresets, loadFixtureCapture, previewFromCapture } from "@/lib/captures/files";
import type { CaptureRecord } from "@/lib/captures/types";
import { budgetDefaults } from "@/lib/config";
import { fixtureById, FIXTURES } from "@/fixtures/cases";
import { createFixtureLlm, createFixtureRdap, createFixtureResearch, createFixtureScreenshots } from "@/lib/providers/fixture";
import type { AgentEvent, CaseReport, VerdictLevel } from "@/lib/types";

export interface ReplayPack {
  id: string;
  label: string;
  blurb: string;
  expected: { verdict: VerdictLevel; typology: string | null };
  input: string;
  events: AgentEvent[];
  report: CaseReport;
}

const cache = new Map<string, ReplayPack>();

export function presetMeta() {
  const fixtures = FIXTURES.map((fixture) => ({
    id: fixture.id,
    label: fixture.label,
    blurb: fixture.blurb,
    expected: fixture.expected,
    input: fixture.domain ? fixture.domain : fixture.phone ? "+65 8123 4409" : fixture.names[0] ?? fixture.id,
    context: fixture.id === "payee-jordan" ? "Marketplace seller asked me to pay their personal account. Payee Jordan Lee." : fixture.id === "quantum-yield" ? "User says this is an investment platform." : "",
  }));
  const captures = listFixtureCapturePresets().map((preview) => ({
    id: preview.id,
    label: preview.label,
    blurb: preview.blurb,
    expected: preview.expected,
    input: preview.input,
    context: preview.context,
  }));
  return [...fixtures, ...captures];
}

async function promotedFromStore(id: string): Promise<CaptureRecord | null> {
  try {
    const capture = await (await readyUsageStore()).getCapture(id);
    return capture?.promoted ? capture : null;
  } catch {
    return null;
  }
}

function packFromStored(capture: CaptureRecord): ReplayPack | null {
  const preview = previewFromCapture(capture);
  if (!preview) return null;
  return {
    id: preview.id,
    label: preview.label,
    blurb: preview.blurb,
    expected: preview.expected,
    input: preview.input,
    events: preview.events,
    report: preview.report,
  };
}

export async function hasReplay(id: string): Promise<boolean> {
  if (!isSafeCaptureId(id)) return false;
  if (fixtureById(id)) return true;
  if (loadFixtureCapture(id)) return true;
  return Boolean(await promotedFromStore(id));
}

export async function getReplay(id: string): Promise<ReplayPack | null> {
  if (!isSafeCaptureId(id)) return null;
  const cached = cache.get(id);
  if (cached) return cached;
  const fixture = fixtureById(id);
  if (!fixture) {
    const recorded = loadFixtureCapture(id);
    // Store captures are read every time: the owner can unpromote or delete one.
    const stored = recorded ?? (await promotedFromStore(id));
    const pack = stored ? packFromStored(stored) : null;
    if (pack && recorded) cache.set(id, pack);
    return pack;
  }
  const meta = presetMeta().find((item) => item.id === id);
  const events: AgentEvent[] = [];
  const generator = runInvestigation({
    raw: meta?.input ?? fixture.domain ?? fixture.names[0] ?? id,
    context: meta?.context,
    mode: "replay",
    replayReason: "recorded_fixture",
    caseId: fixture.id,
    deps: {
      research: createFixtureResearch(fixture),
      rdap: createFixtureRdap(fixture),
      screenshots: createFixtureScreenshots(fixture),
      llm: createFixtureLlm(fixture),
      budget: new Budget(budgetDefaults()),
    },
  });
  let step = await generator.next();
  while (!step.done) {
    events.push(step.value);
    step = await generator.next();
  }
  const pack: ReplayPack = {
    id: fixture.id,
    label: fixture.label,
    blurb: fixture.blurb,
    expected: fixture.expected,
    input: meta?.input ?? fixture.id,
    events,
    report: step.value,
  };
  cache.set(id, pack);
  return pack;
}
