import type { SearchHit } from "@/lib/types";

export type LlmTask = "normalize" | "plan" | "select" | "extract" | "adjudicate" | "memo" | "vision";

export interface LlmRequest {
  task: LlmTask;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  imageDataUrl?: string;
}

export interface LlmResponse {
  json: Record<string, unknown> | null;
  text: string;
  model: string;
  tokens: { in: number; out: number };
  error?: string;
  /** The provider omitted a token count, so the reservation stands. */
  usageOmitted?: boolean;
}

export interface SearchRequest {
  action: "search_reports" | "search_regulator" | "search_news" | "find_copycats" | "verify_registration";
  query: string;
  depth: "basic" | "advanced";
  maxResults: number;
  topic?: "general" | "news" | "finance";
  includeDomains?: string[];
}

export interface SearchResponse {
  results: SearchHit[];
  credits: number;
  requestId?: string;
  error?: string;
  /** The provider omitted a credit count, so the reservation stands. */
  usageOmitted?: boolean;
}

export interface ExtractResponse {
  pages: Array<{ url: string; title: string; content: string }>;
  failed: string[];
  credits: number;
  error?: string;
  /** The provider omitted a credit count, so the reservation stands. */
  usageOmitted?: boolean;
}

export interface MapResponse {
  urls: string[];
  credits: number;
  error?: string;
  /** The provider omitted a credit count, so the reservation stands. */
  usageOmitted?: boolean;
}

export interface CrawlResponse {
  pages: Array<{ url: string; title: string; content: string }>;
  credits: number;
  error?: string;
  /** The provider omitted a credit count, so the reservation stands. */
  usageOmitted?: boolean;
}

export interface ResearchProvider {
  search(request: SearchRequest): Promise<SearchResponse>;
  extract(urls: string[], query: string): Promise<ExtractResponse>;
  map(url: string): Promise<MapResponse>;
  crawl(url: string, instructions: string): Promise<CrawlResponse>;
}

export interface RdapResult {
  domain: string;
  ageDays: number | null;
  registrar?: string;
  created?: string;
  error?: string;
}

export interface RdapProvider {
  lookup(domain: string): Promise<RdapResult>;
}

export interface VisionResult {
  skipped: boolean;
  finding: string;
  confidence: number;
  impersonation: boolean;
  impersonationKind?: "bank" | "government" | "none";
  stockPhoto: boolean;
  fakeBadges: boolean;
  model?: string;
  error?: string;
}

export interface ScreenshotProvider {
  capture(url: string): Promise<{ imageDataUrl?: string; error?: string; skipped?: boolean }>;
}

export interface LlmProvider {
  readonly live: boolean;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
