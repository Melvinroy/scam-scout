export type VerdictLevel = "Low" | "Medium" | "High" | "Not enough evidence";
export type Confidence = "Low" | "Medium" | "High";

export type EntityType = "url" | "domain" | "merchant_name" | "phone" | "payee";

export type ActionName =
  | "search_reports"
  | "search_regulator"
  | "search_news"
  | "extract_pages"
  | "map_site"
  | "crawl_site"
  | "find_copycats"
  | "screenshot"
  | "rdap"
  | "verify_registration"
  | "stop";

export type IslandId =
  | "hq"
  | "shop"
  | "sitemap"
  | "clones"
  | "newsstand"
  | "regulator"
  | "photolab"
  | "records";

export type JobId =
  | "seeker"
  | "reader"
  | "cartographer"
  | "inspector"
  | "lens"
  | "archivist"
  | "dispatcher"
  | "clerk"
  | "chief";

export type SourceType =
  | "regulator"
  | "own_site"
  | "rdap"
  | "news"
  | "vision"
  | "forum"
  | "review"
  | "unknown";

export type SignalCategory = "complaints" | "site" | "other" | "mitigation";

export type TypologyId = "investment_scam" | "fake_shop" | "impersonation" | "app_mule";

export interface CanonicalEntity {
  domain?: string;
  url?: string;
  phone?: string;
  names: string[];
}

export interface NormalizedEntity {
  raw: string;
  context: string;
  entity_type: EntityType;
  canonical: CanonicalEntity;
}

export interface Evidence {
  evidence_id: string;
  kind: "web_page" | "screenshot" | "rdap";
  url: string;
  title: string;
  source_domain: string;
  source_type: SourceType;
  retrieved_at: string;
  tool: { name: string; request_id?: string; credits: number };
  quote: string;
  content_sha256: string;
  call_id?: string;
  vision_finding?: { model: string; finding: string; confidence: number };
}

export interface RedFlag {
  signal_id: string;
  title: string;
  weight: number;
  confidence: number;
  source_reliability: number;
  points: number;
  typologies: TypologyId[];
  status: "active" | "disputed";
  evidence_ids: string[];
  explanation: string;
  hard: boolean;
  category: SignalCategory;
}

export interface Verdict {
  level: VerdictLevel;
  score: number;
  confidence: Confidence;
  label: string;
  hard_triggers: string[];
  primary_typology: TypologyId | null;
  secondary_typology: TypologyId | null;
  budget_exhausted: boolean;
  degraded: boolean;
  radar: Record<TypologyId, number>;
  manual_review: boolean;
  /** No legitimacy signal and no scored risk. Level is then "Not enough evidence", not Low. */
  unverified?: boolean;
}

export interface CaseCosts {
  tavily_credits: number;
  llm_tokens: { in: number; out: number };
  /** Nebius token cost for this run, from the model prices. Tavily is separate. */
  nebius_usd?: number;
  usd_est: number;
  wall_ms: number;
}

export interface CaseReport {
  case_id: string;
  input: NormalizedEntity;
  verdict: Verdict;
  red_flags: RedFlag[];
  mitigations: RedFlag[];
  evidence: Evidence[];
  memo: string;
  costs: CaseCosts;
  timings: { wall_ms: number };
  versions: { rubric: string; prompts: string; app: string };
  mode: "live" | "replay";
  replay_reason?: string;
  trace: Array<{
    step: number;
    state: string;
    action?: string;
    reason?: string;
    model?: string;
  }>;
}

export type EventType =
  | "mode.replay"
  | "case.started"
  | "entity.normalized"
  | "plan.created"
  | "agent.decision"
  | "tool.started"
  | "tool.finished"
  | "tool.failed"
  | "evidence.added"
  | "signal.found"
  | "score.provisional"
  | "budget.update"
  | "agent.stop"
  | "score.final"
  | "typology.assigned"
  | "memo.ready"
  | "capture.saved"
  | "case.done";

export interface AgentEvent {
  case_id: string;
  seq: number;
  ts: string;
  type: EventType;
  call_id?: string;
  payload: Record<string, unknown>;
}

export interface SearchHit {
  url: string;
  title: string;
  content: string;
}

export interface BudgetSnapshot {
  steps: number;
  credits: number;
  tokens_in: number;
  tokens_out: number;
  screenshots: number;
  pages: number;
  wall_ms: number;
  exhausted: boolean;
  degraded: boolean;
}
