import type { UsageStore } from "@/lib/abuse/store";
import { redactJson, redactSecrets } from "@/lib/byok";
import type { AuditRecord } from "@/lib/safety/audit";
import type { CaseReport } from "@/lib/types";

/** Every stored copy of a case goes through here, so no key in the input or provider output is kept. */
export async function saveFinishedCase(
  store: UsageStore,
  report: CaseReport,
  secrets: string[],
  audit: { raw: string; mode: string },
): Promise<void> {
  const caseId = String(report.case_id);
  await store.saveReport(caseId, redactJson(report, secrets));
  await recordAudit(store, secrets, {
    ts: new Date().toISOString(),
    caseId,
    mode: report.mode ?? audit.mode,
    verdict: report.verdict?.label ?? "unknown",
    subject: audit.raw,
  });
}

export async function recordAudit(store: UsageStore, secrets: string[], event: AuditRecord): Promise<void> {
  try {
    await store.appendAudit({ ...event, subject: redactSecrets(event.subject, secrets) });
  } catch {
    // A failed audit must not break the stream, and the subject is never logged.
  }
}
