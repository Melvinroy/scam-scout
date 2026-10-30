import { FIXTURES, type FixtureCase, matchFixture } from "@/fixtures/cases";
import type { CrawlResponse, ExtractResponse, LlmProvider, LlmRequest, LlmResponse, MapResponse, RdapProvider, ResearchProvider, ScreenshotProvider, SearchRequest, SearchResponse } from "@/lib/providers/types";

export function resolveFixture(input: string, replayId?: string): FixtureCase | undefined {
  if (replayId) return FIXTURES.find((item) => item.id === replayId);
  return matchFixture(input);
}

export function createFixtureResearch(fixture: FixtureCase): ResearchProvider {
  return {
    async search(request: SearchRequest): Promise<SearchResponse> {
      const query = request.query.toLowerCase();
      const hit = fixture.searches.find((item) => query.includes(item.match) && (!item.action || item.action === request.action));
      return { results: hit?.results ?? [], credits: hit?.credits ?? 1, requestId: `fix_${fixture.id}_${request.action}` };
    },
    async extract(urls: string[]): Promise<ExtractResponse> {
      const wanted = new Set(urls.map((url) => url.replace(/\/$/, "")));
      const pages = fixture.pages.filter((page) => wanted.size === 0 || wanted.has(page.url.replace(/\/$/, "")));
      const found = new Set(pages.map((page) => page.url));
      return {
        pages,
        failed: urls.filter((url) => !found.has(url)),
        credits: Math.max(1, Math.ceil(pages.length / 5)),
      };
    },
    async map(): Promise<MapResponse> {
      return { urls: fixture.map, credits: 1, requestId: `fix_map_${fixture.id}` } as MapResponse;
    },
    async crawl(): Promise<CrawlResponse> {
      return { pages: fixture.crawl, credits: fixture.crawl.length ? 2 : 1 };
    },
  };
}

export function createFixtureRdap(fixture: FixtureCase): RdapProvider {
  return {
    async lookup(domain: string) {
      if (!fixture.domain) return { domain, ageDays: null, error: "no_domain" };
      return { domain, ageDays: fixture.rdap.ageDays, registrar: fixture.rdap.registrar, created: fixture.rdap.created };
    },
  };
}

export function createFixtureScreenshots(fixture: FixtureCase): ScreenshotProvider {
  return {
    async capture() {
      if (fixture.id === "unknown" || !fixture.domain) return { skipped: true };
      return { imageDataUrl: TINY_PNG };
    },
  };
}

// Recorded usage must stay independent of configured live model names.
const FIXTURE_MODEL = "nvidia/nemotron-3-super-120b-a12b";

export function createFixtureLlm(fixture: FixtureCase, onCall?: (task: string) => void): LlmProvider {
  return {
    live: false,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      onCall?.(request.task);
      const tokens = { in: 900, out: 160 };
      if (request.task === "normalize") {
        return { json: { names: fixture.names }, text: "", model: FIXTURE_MODEL, tokens };
      }
      if (request.task === "plan") {
        return { json: fixture.plan as unknown as Record<string, unknown>, text: "", model: FIXTURE_MODEL, tokens };
      }
      if (request.task === "select") {
        return { json: { action: "stop", reason: "Recorded policy will choose.", query: "" }, text: "", model: FIXTURE_MODEL, tokens };
      }
      if (request.task === "extract") {
        return { json: { signals: [] }, text: "", model: FIXTURE_MODEL, tokens };
      }
      if (request.task === "vision") {
        return {
          json: {
            finding: fixture.vision.finding,
            confidence: fixture.vision.confidence,
            impersonation: fixture.vision.impersonation,
            impersonation_kind: fixture.vision.impersonationKind,
            stock_photo: fixture.vision.stockPhoto,
            fake_badges: fixture.vision.fakeBadges,
          },
          text: "",
          model: FIXTURE_MODEL,
          tokens,
        };
      }
      if (request.task === "adjudicate") {
        return { json: fixture.adjudication as unknown as Record<string, unknown>, text: "", model: FIXTURE_MODEL, tokens };
      }
      return { json: { markdown: "" }, text: "", model: FIXTURE_MODEL, tokens };
    },
  };
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
