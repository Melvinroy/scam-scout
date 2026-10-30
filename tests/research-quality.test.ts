import { describe, expect, it } from "vitest";
import { adoptedDomain } from "@/lib/agent/adopt";
import { Budget } from "@/lib/agent/budget";
import { runInvestigation } from "@/lib/agent/machine";
import { normalizeInput } from "@/lib/agent/normalize";
import { rankSearchHits } from "@/lib/agent/rank";
import { exactInTitleOrUrl } from "@/lib/agent/surface";
import { regulatorFloorQueries } from "@/lib/agent/regulator-queries";
import { emptyCase, reduceCase } from "@/lib/case/reducer";
import { budgetDefaults } from "@/lib/config";
import { HARBOURBANK_INSTITUTION_PAGE, RECORDED_DEMOS, type RecordedDemo } from "@/fixtures/recorded/demo-cases";
import { sheetColor, sheetFromView } from "@/lib/ui/live-sheet";
import type { CaseReport, SearchHit } from "@/lib/types";
import type { LlmProvider, RdapProvider, ResearchProvider, ScreenshotProvider, SearchRequest } from "@/lib/providers/types";

describe("targeted regulator research", () => {
  it("searches the warning list that fits the input, in both scripts for a Unicode domain", () => {
    const london = regulatorFloorQueries(normalizeInput("The Quarnby Investment Bank"));
    expect(london).toHaveLength(1);
    expect(london[0]?.query).toContain('"The Quarnby Investment Bank"');
    expect(london[0]?.query).toContain("site:\u0066ca.org.uk/news/warnings");
    expect(london[0]?.includeDomains).toEqual(["\u0066ca.org.uk"]);

    const northgate = regulatorFloorQueries(normalizeInput("northgate-markets.example"));
    expect(northgate.map((query) => query.includeDomains.join())).toEqual(["\u0066ca.org.uk", "\u0073ec.gov,investor.gov,\u0073ec.gov.ph", "\u0063ftc.gov"]);
    expect(northgate.every((query) => query.depth === "basic" && query.query.includes('"northgate-markets.example"'))).toBe(true);
    expect(northgate.some((query) => query.query.includes("\u0046CA Warning List"))).toBe(false);

    const hk = regulatorFloorQueries(normalizeInput("香港郵政電子郵件.com"));
    expect(hk.some((query) => query.query.includes('"香港郵政電子郵件.com"') && query.query.includes('"xn--5nqx41a7vhqjjzy7bca609hbif.com"'))).toBe(true);
    expect(hk.some((query) => query.includeDomains.join() === "\u0069nfo.gov.hk,\u0070olice.gov.hk,\u0073camshield.gov.sg")).toBe(true);

    const harbourbank = regulatorFloorQueries(normalizeInput("harbourbank.com.sg"));
    const fid = harbourbank.find((query) => query.query.includes("eservices.\u006das.gov.sg/fid/institution"));
    expect(fid?.includeDomains).toEqual(["eservices.\u006das.gov.sg"]);
    expect(fid?.query).toContain('"harbourbank.com.sg"');
    expect(fid?.query).toContain('"harbourbank.com"');
    const cedarbank = regulatorFloorQueries(normalizeInput("cedarbank.com.sg"));
    const cedarbankFid = cedarbank.find((query) => query.query.includes("eservices.\u006das.gov.sg/fid/institution"));
    expect(cedarbankFid?.query).toContain('"cedarbank.com.sg"');
    expect(cedarbankFid?.query).toContain('"cedarbank.com"');
    expect(cedarbankFid?.query).not.toContain("HARBOURBANK");
    expect(harbourbank.some((query) => query.includeDomains.includes("\u0066ca.org.uk"))).toBe(true);
    expect(harbourbank.some((query) => query.includeDomains.includes("\u006das.gov.sg") && query.includeDomains.includes("eservices.\u006das.gov.sg"))).toBe(false);
    const phone = regulatorFloorQueries(normalizeInput("+65 8123 4409"));
    expect(phone).toHaveLength(1);
    expect(phone[0]?.query).toContain("site:\u0066ca.org.uk/news/warnings");
    for (const input of ["payloop.example", "shopwisp.example", "broker.com.au", "unlisted.sg"]) {
      expect(regulatorFloorQueries(normalizeInput(input)).some((query) => query.query.includes("site:\u0066ca.org.uk/news/warnings"))).toBe(true);
    }
  });

  it("ranks an exact warning above a generic scam-advice page", () => {
    const entity = normalizeInput("The Quarnby Investment Bank");
    const ranked = rankSearchHits(
      [
        {
          url: "https://www.fco.example/consumers/protect-yourself-scams",
          title: "Protect yourself from scams",
          content: "How to spot a scam before you pay.",
        },
        {
          url: "https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm",
          title: "The Quarnby Investment Bank (Clone of FCO Authorised firm)",
          content: "This firm is not authorised by the FCO.",
        },
      ],
      entity,
    );
    expect(ranked[0]?.url).toContain("/news/warnings/quarnby-investment-bank");
  });

  it("ranks the northgate-markets.example warning first and drops near-name clones", () => {
    const entity = normalizeInput("northgate-markets.example");
    const exact = "https://www.fco.example/news/warnings/northgate-markets-example-clone-fco-authorised-firm";
    expect(exactInTitleOrUrl("northgate-markets.example (Clone of FCO authorised firm)", exact, entity)).toBe(true);
    const ranked = rankSearchHits(
      [
        {
          url: "https://www.fco.example/news/warnings/global-markets-ltd-clone",
          title: "Global Markets Ltd clone",
          content: "Related: northgate-markets.example (Clone of FCO authorised firm).",
        },
        {
          url: "https://www.fco.example/news/warnings/northgate-group-asset-management-clone",
          title: "Northgate Group Asset Management clone",
          content: "northgate-markets.example is listed separately.",
        },
        {
          url: "https://www.fco.example/news/press-releases/fco-fines-northgate-groups-global-markets-limited",
          title: "FCO fines Northgate Group's global markets business",
          content: "The genuine Northgate Group brand was fined. Query echo: northgate-markets.example.",
        },
        {
          url: exact,
          title: "northgate-markets.example (Clone of FCO authorised firm)",
          content: "This firm is not authorised by us.",
        },
        {
          url: `${exact}/`,
          title: "northgate-markets.example (Clone of FCO authorised firm)",
          content: "Duplicate of the same warning.",
        },
        {
          url: "https://www.fco.example/news/warnings/quarnby-ethical-investment-bank",
          title: "Quarnby Ethical Investment Bank",
          content: "The Quarnby Investment Bank is a different firm.",
        },
      ],
      entity,
    );
    expect(ranked.map((hit) => hit.url)).toEqual([exact]);
    const london = normalizeInput("The Quarnby Investment Bank");
    const londonRanked = rankSearchHits(
      [
        {
          url: "https://www.fco.example/news/warnings/investment-bank-of-quarnby-inc",
          title: "Investment Bank of Quarnby Inc.",
          content: "The Quarnby Investment Bank appears in related warnings.",
        },
        {
          url: "https://www.fco.example/news/warnings/quarnby-ethical-investment-bank",
          title: "Quarnby Ethical Investment Bank",
          content: "Clone firm. The Quarnby Investment Bank.",
        },
        {
          url: "https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm",
          title: "The Quarnby Investment Bank (Clone of FCO Authorised firm)",
          content: "This firm is not authorised by the FCO.",
        },
      ],
      london,
    );
    expect(londonRanked.map((hit) => hit.url)).toEqual([
      "https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm",
    ]);
  });

  it("does not adopt a domain from a list, and does adopt one tied to the name", () => {
    const entity = normalizeInput("The Quarnby Investment Bank");
    expect(adoptedDomain([{
      title: "Clone bank list",
      text: "The Quarnby Investment Bank multi-bankpro.com northbridge-pay.com otherhost.example",
    }], entity)).toBeNull();
    expect(adoptedDomain([{
      title: "Tied",
      text: "The Quarnby Investment Bank uses www.quarnby-markets.com for its site.",
    }], entity)).toBe("quarnby-markets.com");
  });

  it.each(RECORDED_DEMOS.map((demo) => [demo.input, demo] as const))(
    "scores %s from the recorded pages",
    async (_input, demo) => {
      const { report, requests, extracts, view } = await investigate(demo);
      const sheet = sheetFromView(view);
      expect(report.verdict.level, JSON.stringify(report.verdict)).toBe(demo.expected);
      expect(report.costs.tavily_credits).toBeLessThanOrEqual(8);
      expect(requests.some((request) => request.query.includes("site:\u0066ca.org.uk/news/warnings"))).toBe(true);
      expect(requests.some((request) => request.query.includes(`"${demo.input}"`))).toBe(true);
      if (demo.input === "northgate-markets.example" || demo.input === "SHOPWISP.EXAMPLE" || demo.input === "tradepebble.example") {
        expect(requests.some((request) => request.includeDomains?.includes("\u0073ec.gov.ph"))).toBe(true);
      }
      if (demo.expected === "Not enough evidence") {
        expect(report.verdict.unverified).toBe(true);
        expect(report.verdict.level).not.toBe("Low");
        expect(report.mitigations.some((flag) => flag.signal_id === "M1")).toBe(false);
        expect(sheet.stamp).toBe("Not enough evidence / Unverified");
        expect(sheet.score).toBeNull();
        expect(report.evidence.some((item) => /\.pdf(?:$|\?)/i.test(item.url))).toBe(false);
        expect(report.evidence.some((item) => /\/api\/register|enforcement/i.test(item.url))).toBe(false);
        expect(report.memo).toMatch(/did not find enough evidence/i);
      } else if (demo.expected === "High") {
        expect(report.verdict.hard_triggers.length).toBeGreaterThan(0);
        expect(sheet.stamp).toBe("High risk");
        expect(report.verdict.unverified).not.toBe(true);
        if (report.verdict.hard_triggers.includes("R1")) expect(report.verdict.score).toBeGreaterThanOrEqual(75);
      } else {
        expect(report.mitigations.some((flag) => flag.signal_id === "M1")).toBe(true);
        expect(report.verdict.unverified).not.toBe(true);
        expect(report.verdict.label).toBe("Low");
        expect(report.verdict.manual_review).toBe(false);
        expect(sheet.stamp).toBe("Low risk");
        expect(sheetColor(sheet)).toBe("#0c7a43");
        expect(report.evidence.some((item) => item.url.includes("/fid/institution/detail/"))).toBe(true);
      }
      if (demo.input === "The Quarnby Investment Bank") {
        expect(sheet.subject).toBe("The Quarnby Investment Bank");
        expect(report.input.canonical.domain).not.toBe("multi-bankpro.com");
        const cited = new Set(report.red_flags.filter((flag) => flag.signal_id === "R1").flatMap((flag) => flag.evidence_ids));
        const urls = report.evidence.filter((item) => cited.has(item.evidence_id)).map((item) => item.url);
        expect(report.evidence[0]?.url).toBe("https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm");
        expect(report.evidence.filter((item) => item.url.includes("quarnby-investment-bank-clone"))).toHaveLength(1);
        expect(report.evidence.some((item) => /islamic|bank-of-london-inc/i.test(item.url))).toBe(false);
        expect(urls).toContain("https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm");
        expect(urls.some((url) => url.includes("protect-yourself-scams"))).toBe(false);
      }
      if (demo.input === "northgate-markets.example") {
        const exact = "https://www.fco.example/news/warnings/northgate-markets-example-clone-fco-authorised-firm";
        expect(report.evidence[0]?.url).toBe(exact);
        expect(report.evidence.filter((item) => item.url.replace(/\/$/, "") === exact)).toHaveLength(1);
        expect(report.evidence.some((item) => /global-markets-ltd|northgate-group-asset-management|press-releases|northgate-markets-outlook|northgate-group-distribution/i.test(item.url))).toBe(false);
        expect(report.verdict.hard_triggers).toContain("R1");
        expect(report.verdict.score).toBeGreaterThanOrEqual(75);
      }
      if (demo.input === "香港郵政電子郵件.com") {
        expect(report.evidence[0]?.url).toContain("P2025120100743");
        expect(report.input.canonical.domain).not.toBe("harbour-directory.example");
        expect(report.verdict.hard_triggers).toContain("R1");
        expect(report.verdict.score).toBeGreaterThanOrEqual(75);
        const cited = new Set(report.red_flags.filter((flag) => flag.signal_id === "R1").flatMap((flag) => flag.evidence_ids));
        expect(report.evidence.filter((item) => cited.has(item.evidence_id)).every((item) => item.url.includes("notices.harbour.example"))).toBe(true);
      }
      if (demo.input === "SHOPWISP.EXAMPLE") {
        expect(report.verdict.hard_triggers).toContain("R1");
        expect(report.verdict.score).toBeGreaterThanOrEqual(75);
        expect(sheet.stamp).toBe("High risk");
        expect(report.evidence.some((item) => item.url.includes("/news/press-release/2026-shopwisp-example"))).toBe(true);
        expect(report.evidence.some((item) => item.title.includes("SOB flags fake SHOPWISP.EXAMPLE platform"))).toBe(true);
        expect(report.evidence.some((item) => item.url.includes("coinharbour.example"))).toBe(true);
      }
      if (demo.input === "harbourbank.com.sg") {
        expect(requests.some((request) => request.query.includes('"harbourbank.com.sg"') && request.query.includes('"harbourbank.com"') && request.query.includes("site:eservices.\u006das.gov.sg/fid/institution") && request.includeDomains?.join() === "eservices.\u006das.gov.sg")).toBe(true);
        expect(extracts.some((urls) => urls.includes(HARBOURBANK_INSTITUTION_PAGE.url))).toBe(true);
        expect(report.costs.tavily_credits).toBe(8);
        expect(report.evidence.some((item) => item.url.includes("/fid/institution/detail/900002-HARBOURBANK-BANK-LTD"))).toBe(true);
        expect(report.evidence.some((item) => item.quote.includes("HARBOURBANK BANK LTD.") && item.quote.includes("Local Bank"))).toBe(true);
        expect(report.evidence.some((item) => item.quote.includes("HARBOURBANK DIGITAL EXCHANGE") && item.quote.includes("Licence Type"))).toBe(true);
        expect(report.evidence.some((item) => item.url.includes("/fid/institution?"))).toBe(false);
        expect(report.evidence.some((item) => /data\.fco\.org\.uk|\/nsm\/|\.pdf(?:$|\?)|\/api\/register|enforcement/i.test(item.url))).toBe(false);
        expect(report.evidence.some((item) => /riverton/i.test(item.title))).toBe(false);
      }
    },
  );
});

async function investigate(demo: RecordedDemo): Promise<{ report: CaseReport; requests: SearchRequest[]; extracts: string[][]; view: ReturnType<typeof emptyCase> }> {
  const requests: SearchRequest[] = [];
  const extracts: string[][] = [];
  const research: ResearchProvider = {
    async search(request) {
      requests.push(request);
      return { results: hitsFor(demo, request), credits: request.depth === "advanced" ? 2 : 1 };
    },
    async extract(urls) {
      extracts.push(urls);
      const page = urls.find((url) => url === HARBOURBANK_INSTITUTION_PAGE.url);
      if (!page) return { pages: [], failed: [], credits: 1 };
      return { pages: [{ url: page, title: HARBOURBANK_INSTITUTION_PAGE.title, content: HARBOURBANK_INSTITUTION_PAGE.content }], failed: [], credits: 1 };
    },
    async map() {
      return { urls: [], credits: 1 };
    },
    async crawl() {
      return { pages: [], credits: 1 };
    },
  };
  const rdap: RdapProvider = { async lookup(domain) { return { domain, ageDays: demo.ageDays ?? null }; } };
  const screenshots: ScreenshotProvider = { async capture() { return { skipped: true }; } };
  const llm: LlmProvider = {
    live: false,
    async complete() {
      return { json: {}, text: "", model: "nvidia/Nemotron-3_5-Lightning", tokens: { in: 0, out: 0 } };
    },
  };
  const generator = runInvestigation({
    raw: demo.input,
    mode: "replay",
    replayReason: "recorded_fixture",
    deps: { research, rdap, screenshots, llm, budget: new Budget(budgetDefaults()) },
  });
  let view = emptyCase();
  let step = await generator.next();
  while (!step.done) {
    view = reduceCase(view, step.value);
    step = await generator.next();
  }
  return { report: step.value, requests, extracts, view };
}

function hitsFor(demo: RecordedDemo, request: SearchRequest): SearchHit[] {
  const query = request.query.toLowerCase();
  const domains = request.includeDomains ?? [];
  const row = demo.searches.find((item) => {
    if (!query.includes(item.when)) return false;
    if (!item.domains) return domains.length === 0;
    return item.domains.length === domains.length && item.domains.every((domain) => domains.includes(domain));
  });
  return row?.results ?? [];
}
