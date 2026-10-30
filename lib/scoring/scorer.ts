import { CATEGORY_CAPS, SIGNAL_DEFS, TYPOLOGIES } from "@/lib/scoring/rubric";
import type { Confidence, RedFlag, SignalCategory, TypologyId, Verdict, VerdictLevel } from "@/lib/types";

export interface SignalDraft {
  signal_id: string;
  confidence: number;
  source_reliability: number;
  evidence_ids: string[];
  explanation: string;
  quote?: string;
  /** Overrides the catalogue weight (domain-age D1 is 15 under 90 days and 8 under a year). */
  weight?: number;
  hard?: boolean;
}

export function pointsFor(weight: number, confidence: number, reliability: number): number {
  return weight * clamp01(confidence) * clamp01(reliability);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function draftToFlag(draft: SignalDraft): RedFlag | null {
  const def = SIGNAL_DEFS[draft.signal_id];
  if (!def) return null;
  const weight = draft.weight ?? def.weight;
  const confidence = clamp01(draft.confidence);
  const reliability = clamp01(draft.source_reliability);
  return {
    signal_id: def.id,
    title: def.title,
    weight,
    confidence,
    source_reliability: reliability,
    points: round1(pointsFor(weight, confidence, reliability)),
    typologies: def.typologies,
    status: "active",
    evidence_ids: draft.evidence_ids,
    explanation: draft.explanation,
    hard: draft.hard ?? def.hard,
    category: def.category,
  };
}

export function radarFor(flags: RedFlag[]): Record<TypologyId, number> {
  const byId = new Map(flags.filter((f) => f.status === "active" && f.points > 0).map((f) => [f.signal_id, f]));
  const radar = {
    investment_scam: 0,
    fake_shop: 0,
    impersonation: 0,
    app_mule: 0,
  } satisfies Record<TypologyId, number>;
  for (const axis of TYPOLOGIES) {
    const ids = [...axis.primary, ...axis.supporting];
    let got = 0;
    let max = 0;
    for (const id of ids) {
      const def = SIGNAL_DEFS[id];
      if (!def || def.weight <= 0) continue;
      max += def.weight;
      const flag = byId.get(id);
      if (flag) got += Math.max(0, flag.points);
    }
    radar[axis.id] = max === 0 ? 0 : Math.min(100, Math.round((got / max) * 100));
  }
  return radar;
}

export function rankTypologies(radar: Record<TypologyId, number>): TypologyId[] {
  return (Object.keys(radar) as TypologyId[]).sort((a, b) => radar[b] - radar[a] || a.localeCompare(b));
}

export interface ScoreInput {
  flags: RedFlag[];
  independentSources: number;
  floorComplete: boolean;
  budgetExhausted: boolean;
  degraded: boolean;
  primaryOverride?: TypologyId | null;
  secondaryOverride?: TypologyId | null;
}

export function scoreCase(input: ScoreInput): Verdict {
  const active = input.flags.filter((f) => f.status === "active" || (f.hard && f.points > 0));
  const buckets: Record<SignalCategory, number> = {
    complaints: 0,
    site: 0,
    other: 0,
    mitigation: 0,
  };
  for (const flag of active) {
    buckets[flag.category] += flag.points;
  }
  if (CATEGORY_CAPS.complaints !== undefined) {
    buckets.complaints = Math.min(CATEGORY_CAPS.complaints, buckets.complaints);
  }
  if (CATEGORY_CAPS.site !== undefined) {
    buckets.site = Math.min(CATEGORY_CAPS.site, buckets.site);
  }
  const raw = buckets.complaints + buckets.site + buckets.other + buckets.mitigation;
  const hard = active.filter((f) => f.hard && f.points > 0).map((f) => f.signal_id);
  let score = Math.round(Math.min(100, Math.max(0, raw)));
  if (hard.includes("R1")) score = Math.max(score, 75);
  else if (hard.includes("R3")) score = Math.max(score, 60);
  let level: VerdictLevel = "Low";
  if (hard.length > 0 || score >= 60) level = "High";
  else if (score >= 30) level = "Medium";

  let confidence: Confidence = "Medium";
  if (input.degraded || input.budgetExhausted || input.independentSources < 2 || !input.floorComplete) {
    confidence = "Low";
  } else if (input.independentSources >= 3 && input.floorComplete) {
    confidence = "High";
  }

  const radar = radarFor(active);
  const ranked = rankTypologies(radar).filter((id) => radar[id] > 0);
  const primary = input.primaryOverride === undefined ? (ranked[0] ?? null) : input.primaryOverride;
  const secondary =
    input.secondaryOverride === undefined
      ? (ranked.find((id) => id !== primary) ?? null)
      : input.secondaryOverride;
  const legitimacy = active.some((flag) => flag.points < 0 && (flag.signal_id === "M1" || flag.signal_id === "M4"));
  const scored = active.some((flag) => flag.points !== 0);
  const unverified = !scored || (level === "Low" && hard.length === 0 && !legitimacy);
  if (unverified) level = "Not enough evidence";
  const manual = !unverified && level === "Low" && confidence === "Low" && !legitimacy;
  const label = unverified ? "Not enough evidence / Unverified" : manual ? "Insufficient evidence — manual review" : level;

  return {
    level,
    score,
    confidence,
    label,
    hard_triggers: hard,
    primary_typology: primary,
    secondary_typology: secondary && secondary !== primary ? secondary : null,
    budget_exhausted: input.budgetExhausted,
    degraded: input.degraded,
    radar,
    manual_review: manual,
    unverified,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
