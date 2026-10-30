import type { AgentEvent, IslandId, JobId } from "@/lib/types";

export type Intent =
  | { type: "world.wake"; entityLabel: string }
  | { type: "board.pin"; label: string }
  | { type: "board.flags"; priors: Record<string, number> }
  | { type: "dispatcher.point"; destination: IslandId; reason: string }
  | { type: "scout.spawn"; callId: string; job: JobId; destination: IslandId; query: string }
  | { type: "island.react"; destination: IslandId; callId?: string; payload: Record<string, unknown> }
  | { type: "scout.pickUp"; callId: string; evidenceId: string; sourceType: string; title: string }
  | { type: "card.ribbon"; evidenceIds: string[]; signalId: string }
  | { type: "scout.shrug"; callId: string }
  | { type: "budget.update"; credits: number; tokens: number }
  | { type: "scale.tilt"; score: number }
  | { type: "scouts.recall"; reason: string }
  | { type: "chief.stamp"; level: string; lowConfidence: boolean }
  | { type: "typology.tab"; typology: string | null }
  | { type: "celebrate" }
  | { type: "memo.unroll" }
  | { type: "hq.dim" }
  | { type: "replay.badge"; reason: string };

export function presentationScale(queueDepth: number): number {
  if (queueDepth > 8) return 3;
  if (queueDepth > 4) return 2;
  if (queueDepth > 2) return 1.5;
  return 1;
}

export function toIntents(event: AgentEvent): Intent[] {
  const payload = event.payload;
  switch (event.type) {
    case "mode.replay":
      return [{ type: "replay.badge", reason: String(payload.reason ?? "replay") }];
    case "case.started":
      return [{ type: "world.wake", entityLabel: String(payload.input ?? "New case") }];
    case "entity.normalized": {
      const canonical = (payload.canonical ?? {}) as { domain?: string; phone?: string; names?: string[] };
      const label = canonical.domain || canonical.phone || canonical.names?.[0] || "Entity";
      return [{ type: "board.pin", label }];
    }
    case "plan.created":
      return [{ type: "board.flags", priors: (payload.priors as Record<string, number>) ?? {} }];
    case "agent.decision":
      return [
        {
          type: "dispatcher.point",
          destination: (payload.destination as IslandId) ?? "hq",
          reason: String(payload.reason ?? ""),
        },
      ];
    case "tool.started":
      return [
        {
          type: "scout.spawn",
          callId: event.call_id ?? "",
          job: (payload.job as JobId) ?? "seeker",
          destination: (payload.destination as IslandId) ?? "newsstand",
          query: String(payload.args_preview ?? ""),
        },
      ];
    case "tool.finished":
      return [
        {
          type: "island.react",
          destination: (payload.destination as IslandId) ?? "hq",
          callId: event.call_id,
          payload,
        },
      ];
    case "tool.failed":
      return event.call_id
        ? [
            { type: "island.react", destination: (payload.destination as IslandId) ?? "hq", callId: event.call_id, payload },
            { type: "scout.shrug", callId: event.call_id },
          ]
        : [];
    case "evidence.added":
      return event.call_id
        ? [
            {
              type: "scout.pickUp",
              callId: event.call_id,
              evidenceId: String(payload.evidence_id ?? ""),
              sourceType: String(payload.source_type ?? "unknown"),
              title: String(payload.title ?? "Evidence"),
            },
          ]
        : [];
    case "signal.found": {
      const points = Number(payload.points ?? 0);
      if (points <= 0) return [];
      const evidenceIds = Array.isArray(payload.evidence_ids) ? payload.evidence_ids.map(String) : [];
      return [{ type: "card.ribbon", evidenceIds, signalId: String(payload.signal_id ?? "") }];
    }
    case "score.provisional":
      return [{ type: "scale.tilt", score: Number(payload.score ?? 0) }];
    case "score.final": {
      const verdict = (payload.verdict ?? {}) as { level?: string; confidence?: string; unverified?: boolean; budget_exhausted?: boolean; degraded?: boolean };
      const level = verdict.unverified || verdict.level === "Not enough evidence" ? "Not enough evidence" : (verdict.level || "Low");
      const intents: Intent[] = [{ type: "chief.stamp", level, lowConfidence: verdict.confidence === "Low" }];
      if (verdict.budget_exhausted || verdict.degraded || verdict.confidence === "Low") intents.push({ type: "hq.dim" });
      return intents;
    }
    case "budget.update":
      return [
        {
          type: "budget.update",
          credits: Number(payload.credits ?? 0),
          tokens: Number(payload.tokens_in ?? 0) + Number(payload.tokens_out ?? 0),
        },
      ];
    case "agent.stop":
      return [{ type: "scouts.recall", reason: String(payload.reason ?? "") }];
    case "typology.assigned":
      return [{ type: "typology.tab", typology: (payload.primary_typology as string | null) ?? null }];
    case "memo.ready":
      return [{ type: "memo.unroll" }];
    case "case.done":
      return [{ type: "celebrate" }];
    default:
      return [];
  }
}
