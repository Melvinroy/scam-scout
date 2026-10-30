import type { AgentEvent, CaseReport } from "@/lib/types";

/** Tavily credits for one finished run. Tool events carry the API count; the report total is the fallback. */
export function tavilyCreditsForRun(events: AgentEvent[], report: CaseReport): number {
  const fromCalls = events
    .filter((event) => event.type === "tool.finished" || event.type === "tool.failed")
    .reduce((sum, event) => sum + finite(event.payload?.credits), 0);
  return round1(Math.max(fromCalls, finite(report.costs?.tavily_credits)));
}

/** Nebius USD recorded on the case. Zero when the run never reached a model. */
export function nebiusUsdForRun(report: CaseReport): number {
  const value = report.costs?.nebius_usd;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function finite(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
