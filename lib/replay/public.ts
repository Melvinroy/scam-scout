import { replayMessage } from "@/lib/replay/message";

/** Explicit public report, recording and event fields. Unrecognized fields fail closed. */
const PUBLIC_FIELDS = new Set(`
  id label blurb expected input context events report verdict typology
  case_id seq ts type call_id payload badge mode
  raw entity_type canonical domain url phone names discovered
  hypotheses priors questions action destination job args_preview query expected_signal
  result_count result_urls latency_ms beacon age_days paths missing odd_paths copycats finding rooms closed
  evidence_id evidence_ids kind title source_domain source_type retrieved_at tool name quote content_sha256 vision_finding confidence
  signal_id weight source_reliability points typologies status explanation hard category
  level score hard_triggers primary_typology secondary_typology degraded radar manual_review unverified
  investment_scam fake_shop impersonation app_mule red_flags mitigations evidence memo markdown
  timings wall_ms versions rubric prompts app trace step state
`.split(/\s+/).filter(Boolean));

/** All public JSON and SSE recording paths use the same schema, including cached captures. */
export function publicPayload<T>(value: T): T {
  return project(value) as T;
}

function project(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(project);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  let record = value as Record<string, unknown>;
  if (record.type === "mode.replay" && record.payload && typeof record.payload === "object") {
    const payload = record.payload as Record<string, unknown>;
    record = { ...record, payload: { ...payload, message: replayMessage(payload.reason, payload.message) } };
  }
  for (const [key, item] of Object.entries(record)) {
    if (key === "capture" && item && typeof item === "object") {
      const capture = item as Record<string, unknown>;
      out.capture = project({ id: capture.id, input: capture.input, context: capture.context, mode: capture.mode, report: capture.report, events: capture.events });
    } else if (key === "type" && item === "budget.update") out.type = "check.progress";
    else if (key === "error" && item) out.error = "unavailable";
    else if (key === "message") {
      const message = replayMessage(undefined, item);
      if (message) out.message = message;
    }
    else if (PUBLIC_FIELDS.has(key)) out[key] = project(item);
  }
  return out;
}
