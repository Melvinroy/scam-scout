import { replayMessage } from "@/lib/replay/message";
import type { AgentEvent, CaseReport, Evidence, RedFlag, SourceType, Verdict } from "@/lib/types";

const SOURCE_TYPES = new Set<SourceType>(["regulator", "own_site", "rdap", "news", "vision", "forum", "review", "unknown"]);

export interface TimelineItem {
  id: string;
  action: string;
  job: string;
  destination: string;
  query: string;
  reason?: string;
  status: "running" | "done" | "failed";
  credits?: number;
  latencyMs?: number;
  resultCount?: number;
  urls: string[];
}

export interface CaseView {
  caseId?: string;
  mode: "idle" | "running" | "done";
  replay: boolean;
  replayMessage?: string;
  lastSeq: number;
  input: string;
  label: string;
  events: AgentEvent[];
  timeline: TimelineItem[];
  evidence: Evidence[];
  flags: RedFlag[];
  mitigations: RedFlag[];
  verdict?: Verdict;
  memo: string;
  credits: number;
  tokens: number;
  usd: number;
  wallMs: number;
  score: number;
  radar: Record<string, number>;
  reason: string;
  error?: string;
  report?: CaseReport;
}

/** A new run replaces the previous verdict, error, and case file. */
export function runningCase(input: string): CaseView {
  const label = input.trim();
  return {
    ...emptyCase(),
    mode: "running",
    input: label,
    label,
    verdict: undefined,
    error: undefined,
    report: undefined,
    replayMessage: undefined,
  };
}

export const emptyCase = (): CaseView => ({
  mode: "idle",
  replay: false,
  lastSeq: 0,
  input: "",
  label: "",
  events: [],
  timeline: [],
  evidence: [],
  flags: [],
  mitigations: [],
  memo: "",
  credits: 0,
  tokens: 0,
  usd: 0,
  wallMs: 0,
  score: 0,
  radar: {},
  reason: "",
});

export function reduceCase(state: CaseView, event: AgentEvent): CaseView {
  if (event.seq && event.seq <= state.lastSeq) return state;
  const next: CaseView = {
    ...state,
    lastSeq: event.seq || state.lastSeq,
    events: [...state.events, event],
    mode: state.mode === "idle" ? "running" : state.mode,
    caseId: event.case_id || state.caseId,
  };
  const payload = event.payload;
  switch (event.type) {
    case "mode.replay":
      next.replay = true;
      next.replayMessage = replayMessage(undefined, payload.message);
      break;
    case "case.started":
      next.input = String(payload.input ?? "");
      next.label = next.input;
      break;
    case "entity.normalized": {
      const canonical = (payload.canonical ?? {}) as { domain?: string; phone?: string; names?: string[] };
      if (payload.discovered === true) break;
      next.label = canonical.domain || canonical.phone || canonical.names?.[0] || next.label;
      break;
    }
    case "agent.decision":
      next.reason = String(payload.reason ?? "");
      next.timeline = [
        ...next.timeline,
        {
          id: `decision_${event.seq}`,
          action: String(payload.action ?? "decide"),
          job: "dispatcher",
          destination: String(payload.destination ?? "hq"),
          query: String(payload.query ?? ""),
          reason: next.reason,
          status: "done",
          urls: [],
        },
      ];
      break;
    case "tool.started":
      next.timeline = [
        ...next.timeline,
        {
          id: event.call_id ?? `tool_${event.seq}`,
          action: String(payload.action ?? "tool"),
          job: String(payload.job ?? "seeker"),
          destination: String(payload.destination ?? ""),
          query: String(payload.args_preview ?? ""),
          status: "running",
          urls: [],
        },
      ];
      break;
    case "tool.finished":
    case "tool.failed":
      next.timeline = next.timeline.map((item) =>
        item.id === event.call_id
          ? {
              ...item,
              status: event.type === "tool.failed" ? "failed" : "done",
              credits: Number(payload.credits ?? 0),
              latencyMs: Number(payload.latency_ms ?? 0),
              resultCount: Number(payload.result_count ?? 0),
              urls: Array.isArray(payload.result_urls) ? payload.result_urls.map(String) : [],
            }
          : item,
      );
      break;
    case "signal.found": {
      const flag = payload as unknown as RedFlag;
      if (!flag.signal_id) break;
      const bucket = flag.points < 0 ? "mitigations" : "flags";
      const list = next[bucket].filter((item) => item.signal_id !== flag.signal_id);
      next[bucket] = [...list, flag];
      break;
    }
    case "score.provisional":
      next.score = Number(payload.score ?? next.score);
      next.radar = (payload.radar as Record<string, number>) ?? next.radar;
      break;
    case "score.final":
      next.verdict = payload.verdict as Verdict;
      next.score = next.verdict?.score ?? next.score;
      next.radar = next.verdict?.radar ?? next.radar;
      if (Array.isArray(payload.red_flags)) next.flags = payload.red_flags as RedFlag[];
      if (Array.isArray(payload.mitigations)) next.mitigations = payload.mitigations as RedFlag[];
      break;
    case "budget.update":
      next.credits = Number(payload.credits ?? next.credits);
      next.tokens = Number(payload.tokens_in ?? 0) + Number(payload.tokens_out ?? 0);
      next.usd = Number(payload.usd_est ?? next.usd);
      next.wallMs = Number(payload.wall_ms ?? next.wallMs);
      break;
    case "memo.ready":
      next.memo = String(payload.markdown ?? "");
      break;
    case "evidence.added": {
      const id = String(payload.evidence_id ?? "");
      if (!id || next.evidence.some((item) => item.evidence_id === id)) break;
      const source = SOURCE_TYPES.has(payload.source_type as SourceType) ? (payload.source_type as SourceType) : "unknown";
      next.evidence = [
        ...next.evidence,
        {
          evidence_id: id,
          kind: source === "rdap" ? "rdap" : source === "vision" ? "screenshot" : "web_page",
          url: String(payload.url ?? ""),
          title: String(payload.title ?? id),
          source_domain: String(payload.source_domain ?? ""),
          source_type: source,
          retrieved_at: "",
          tool: { name: "", credits: 0 },
          quote: String(payload.quote ?? ""),
          content_sha256: "",
          call_id: event.call_id,
        },
      ];
      break;
    }
    case "case.done":
      next.mode = "done";
      if (payload.error) next.error = String(payload.error);
      next.report = payload.report as CaseReport;
      if (next.report) applyReport(next, next.report);
      break;
    default:
      break;
  }
  return next;
}

/** Fill the sheet from a saved case file when earlier events never reached the panel. */
export function applyFinishedReport(state: CaseView, report: CaseReport): CaseView {
  return reduceCase(
    { ...state, lastSeq: 0 },
    { case_id: report.case_id, seq: 1, ts: new Date().toISOString(), type: "case.done", payload: { report } },
  );
}

function applyReport(next: CaseView, report: CaseReport): void {
  if (report.memo) next.memo = report.memo;
  if (report.verdict) {
    next.verdict = report.verdict;
    next.score = report.verdict.score;
  }
  if (report.evidence?.length) next.evidence = report.evidence;
  if (report.red_flags?.length) next.flags = report.red_flags;
  if (report.mitigations?.length) next.mitigations = report.mitigations;
  if (typeof report.costs?.tavily_credits === "number") next.credits = report.costs.tavily_credits;
  const raw = report.input?.raw?.trim() ?? "";
  const domain = report.input?.canonical?.domain?.trim() ?? "";
  const name = report.input?.canonical?.names?.find((item) => item.trim())?.trim() ?? "";
  if (!next.input && raw) next.input = raw;
  if (!next.label) next.label = domain || name || raw;
}
