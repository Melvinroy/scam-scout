import type { AgentEvent, CaseReport } from "@/lib/types";

/** A finished owner live run. Kept without the 14-day report expiry. */
export interface CaptureRecord {
  id: string;
  createdAt: string;
  ownerEmail: string;
  input: string;
  context: string;
  mode: "live";
  report: CaseReport;
  events: AgentEvent[];
  /** Tavily credits this run actually used. */
  tavilyCredits?: number;
  /** Nebius token cost for this run, in USD. */
  nebiusUsd?: number;
  promoted: boolean;
  previewId?: string;
}

/** List row. Events and the case file stay off this object. */
export interface CaptureSummary {
  id: string;
  createdAt: string;
  input: string;
  verdict?: string;
  tavilyCredits?: number;
  nebiusUsd?: number;
  promoted: boolean;
  previewId?: string;
}
