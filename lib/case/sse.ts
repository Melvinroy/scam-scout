import { publicPayload } from "@/lib/replay/public";
import { redactJson, scrubSecrets } from "@/lib/byok";
import type { AgentEvent } from "@/lib/types";

/** One server-sent event. Provider output can echo a key, so every live frame is redacted first. */
export function sseFrame(event: AgentEvent, secrets: string[]): string {
  return `data: ${JSON.stringify(redactJson(publicPayload(event), secrets))}\n\n`;
}

/** Neutral public copy for a check that failed. The scrubbed detail goes to the server log only. */
export function caseFailedFrame(error: unknown, seq: number, secrets: string[]): string {
  console.error("case_failed", scrubSecrets(error instanceof Error ? error.message : "investigation_failed", secrets));
  const event = { case_id: "error", seq, ts: new Date().toISOString(), type: "case.done", payload: { error: "The check could not finish. Try again." } };
  return `data: ${JSON.stringify(event)}\n\n`;
}
