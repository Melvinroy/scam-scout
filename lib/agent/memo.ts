import type { CaseReport, Evidence, RedFlag } from "@/lib/types";

export function renderMemo(report: Pick<CaseReport, "case_id" | "input" | "verdict" | "red_flags" | "mitigations" | "evidence" | "costs">): string {
  const subject = report.input.canonical.domain || report.input.canonical.phone || report.input.canonical.names[0] || report.input.raw;
  const flags = report.red_flags
    .map((flag, index) => {
      const evidence = firstEvidence(flag, report.evidence);
      const link = evidence ? `[${evidence.source_domain}](${evidence.url}) [${evidence.evidence_id}]` : "—";
      return `| ${index + 1} | ${flag.title} | ${link} | ${flag.points} |`;
    })
    .join("\n");
  const mitigations = report.mitigations.length
    ? report.mitigations.map((flag) => `- ${flag.title} (${flag.points}) ${tag(flag, report.evidence)}`).join("\n")
    : "None recorded.";
  const unverified = unverifiedLines(report);
  return `# Scam Scout Case Memo — ${report.case_id}
**Subject:** ${subject} (${report.input.entity_type})
**Verdict:** ${report.verdict.label} (score ${report.verdict.score}/100, confidence ${report.verdict.confidence})
**Primary typology:** ${report.verdict.primary_typology ?? "none"}  ·  **Secondary:** ${report.verdict.secondary_typology ?? "none"}

## 1. Summary
${openingSentence(report, subject)} ${summarySentence(report)} The score is a deterministic rubric over cited signals, not a finding that anyone has committed fraud.

## 2. Key red flags
| # | Flag | Evidence | Points |
|---|------|----------|--------|
${flags || "| — | None recorded | — | 0 |"}

## 3. Mitigating factors / contradictions
${mitigations}

## 4. What we could not verify
${unverified}

## 5. Recommended next steps
- Compare the cited pages with the payment file before any release or block.
- If the verdict is High, keep the payout on hold for a human review and preserve the snapshots.
- If the label is insufficient evidence, do not treat the score as a clear.

## 6. Method
Runtime ${(report.costs.wall_ms / 1000).toFixed(1)}s. Rubric v1.0.0.
*Decision support only — not a determination of fraud.*
`;
}

function openingSentence(report: Pick<CaseReport, "verdict">, subject: string): string {
  if (report.verdict.unverified || report.verdict.level === "Not enough evidence") {
    return `Open-web research on ${subject} did not find enough evidence for a risk indicator.`;
  }
  return `Open-web research on ${subject} produced a ${report.verdict.level.toLowerCase()} risk indicator with ${report.verdict.confidence.toLowerCase()} confidence.`;
}

function summarySentence(report: Pick<CaseReport, "verdict" | "red_flags">): string {
  if (report.verdict.hard_triggers.length) {
    return `Hard triggers: ${report.verdict.hard_triggers.join(", ")}.`;
  }
  if (report.red_flags[0]) return `The strongest indicator is ${report.red_flags[0].title.toLowerCase()}.`;
  return "No weighted risk indicators were confirmed.";
}

function tag(flag: RedFlag, evidence: Evidence[]): string {
  const item = firstEvidence(flag, evidence);
  return item ? `[${item.evidence_id}]` : "";
}

function firstEvidence(flag: RedFlag, evidence: Evidence[]): Evidence | undefined {
  return evidence.find((item) => flag.evidence_ids.includes(item.evidence_id));
}

function unverifiedLines(report: Pick<CaseReport, "input" | "evidence" | "verdict">): string {
  const lines: string[] = [];
  if (!report.evidence.some((item) => item.kind === "screenshot")) {
    lines.push("- No screenshot was reviewed, so visual impersonation was not checked.");
  }
  if (!report.input.canonical.domain) {
    lines.push("- No website was tied to this identifier, so site-hygiene checks were skipped.");
  }
  if (report.verdict.budget_exhausted) lines.push("- Some checks remain incomplete.");
  if (lines.length === 0) lines.push("- Register extracts and screenshots cover the questions the agent opened. Private accounts and login-walled chats were not accessed.");
  return lines.join("\n");
}
