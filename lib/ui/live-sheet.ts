import { SIGNAL_DEFS } from "@/lib/scoring/rubric";
import type { CaseView } from "@/lib/case/reducer";
import type { Evidence, RedFlag, SourceType, VerdictLevel } from "@/lib/types";

export type SheetTone = "adverse" | "caution" | "unknown";

export interface SheetSignal {
  id: string;
  label: string;
  finding: string;
  points: number;
  width: number;
  tone: SheetTone;
}

export interface SheetSource {
  id: string;
  label: string;
  kind: string;
  quote: string;
  url: string;
  source: string;
  tone: SheetTone;
}

export interface SheetSlice {
  id: string;
  label: string;
  points: number;
  color: string;
}

export interface LiveSheetModel {
  subject: string;
  sample: string;
  status: CaseView["mode"];
  level?: VerdictLevel;
  unverified: boolean;
  score: number | null;
  stamp: string;
  chips: string[];
  signals: SheetSignal[];
  sources: SheetSource[];
  mix: SheetSlice[];
  memo: string[];
  error?: string;
}

const TONE_COLOR: Record<SheetTone, string> = {
  adverse: "#c4233a",
  caution: "#b45309",
  unknown: "#8b939c",
};

/** Unverified is grey. Low is green only when a legitimacy signal justified it. */
export function sheetColor(sheet: { unverified?: boolean; level?: VerdictLevel }): string {
  if (sheet.unverified) return TONE_COLOR.unknown;
  if (sheet.level === "High") return TONE_COLOR.adverse;
  if (sheet.level === "Medium") return TONE_COLOR.caution;
  if (sheet.level === "Low") return "#0c7a43";
  return TONE_COLOR.unknown;
}

const KIND: Record<SourceType, string> = {
  regulator: "Regulator",
  own_site: "Site",
  rdap: "Registration",
  news: "News",
  vision: "Snapshot",
  forum: "Forum",
  review: "Review",
  unknown: "Source",
};

/** Same words as the result card: a Low level reads “Low risk”, and an unverified case keeps its own phrase. */
export function verdictStamp(verdict?: { level?: VerdictLevel; unverified?: boolean } | null): string | undefined {
  if (!verdict) return undefined;
  if (verdict.unverified) return "Not enough evidence / Unverified";
  if (verdict.level) return `${verdict.level} risk`;
  return undefined;
}

/** The approved sheet, filled only from cited flags and stored evidence. */
export function sheetFromView(view: CaseView): LiveSheetModel {
  const evidence = view.evidence;
  const flags = cited(view.flags, evidence);
  const mitigations = cited(view.mitigations, evidence);
  const unverified = view.verdict?.unverified === true;
  const scored = !unverified && view.mode !== "idle" && (view.verdict != null || view.score > 0);
  const score = unverified ? null : scored ? Math.max(0, Math.min(100, Math.round(view.verdict?.score ?? view.score))) : null;
  const level = view.verdict?.level;
  const citedIds = new Set(flags.flatMap((flag) => flag.evidence_ids));

  const signals: SheetSignal[] = [
    ...flags.map((flag) => toSignal(flag)),
    ...mitigations.map((flag) => toSignal(flag)),
  ];

  const slices: SheetSlice[] = signals
    .filter((signal) => signal.points > 0)
    .map((signal) => ({
      id: signal.id,
      label: signal.label,
      points: signal.points,
      color: TONE_COLOR[signal.tone],
    }));
  if (score != null && (slices.length > 0 || score > 0)) {
    slices.push({
      id: "rest",
      label: "Not scored",
      points: Math.max(0, 100 - score),
      color: "rgba(28,23,51,0.16)",
    });
  }

  const chips: string[] = [];
  if (view.replay) chips.push(view.replayMessage ?? "Recording");
  if (view.mode === "running") chips.push("Sources are still coming in.");

  return {
    subject: view.label || view.input || "Website, phone, or payee",
    sample: view.input && view.input !== view.label ? view.input : "",
    status: view.mode,
    level,
    unverified,
    score,
    stamp: verdictStamp(view.verdict) ?? (view.mode === "running" ? "Checking" : "Ready"),
    chips,
    signals,
    sources: evidence
      .filter((item) => item.quote)
      .map((item) => ({
        id: item.evidence_id,
        label: item.title || item.source_domain || "Source",
        kind: KIND[item.source_type] ?? "Source",
        quote: item.quote,
        url: item.url,
        source: item.source_domain || item.title,
        tone: citedIds.has(item.evidence_id) ? "adverse" : "unknown",
      })),
    mix: slices,
    memo: view.memo
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean),
    error: view.error,
  };
}

function cited(flags: RedFlag[], evidence: Evidence[]): RedFlag[] {
  const ids = new Set(evidence.map((item) => item.evidence_id));
  return flags.filter((flag) => flag.evidence_ids.length > 0 && flag.evidence_ids.every((id) => ids.has(id)));
}

function toSignal(flag: RedFlag): SheetSignal {
  const weight = SIGNAL_DEFS[flag.signal_id]?.weight ?? 0;
  const tone: SheetTone = flag.points >= 20 ? "adverse" : flag.points > 0 ? "caution" : "unknown";
  const width = weight > 0 ? Math.max(0, Math.min(100, Math.round((flag.points / weight) * 100))) : 0;
  return {
    id: flag.signal_id,
    label: flag.title,
    finding: flag.explanation,
    points: flag.points,
    width,
    tone,
  };
}
