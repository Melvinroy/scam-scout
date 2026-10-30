import { OFFICIAL } from "@/lib/agent/regulator-data";
import "./helpers/public-dns";
import { describe, expect, it } from "vitest";
import { Budget } from "@/lib/agent/budget";
import { classifySource, detectSignals, regulatorSearchDomains, REGULATOR_HOSTS } from "@/lib/agent/detect";
import { FCO_LONDON_WARNING } from "@/fixtures/fco-london-warning";
import { runInvestigation } from "@/lib/agent/machine";
import { BRAND_DOMAINS } from "@/lib/agent/lookalike";
import { normalizeInput } from "@/lib/agent/normalize";
import { rankSearchHits } from "@/lib/agent/rank";
import { pickInstitutionProfile, registerEvidenceQuote } from "@/lib/agent/surface";
import { nebiusUsdForRun, tavilyCreditsForRun } from "@/lib/captures/credits";
import { openingReplayInput, recordedReplayMayStart } from "@/lib/client/demo-guard";
import { applyFinishedReport, emptyCase, reduceCase } from "@/lib/case/reducer";
import { budgetDefaults } from "@/lib/config";
import { createNebius, createRdap, createScreenshotClient, createTavilyResearch } from "@/lib/providers/live";
import { draftToFlag, scoreCase } from "@/lib/scoring/scorer";
import { sheetFromView } from "@/lib/ui/live-sheet";
import type { AgentEvent, CaseReport, Evidence, RedFlag } from "@/lib/types";

const QUOTE = "harbourdesk.example is not authorised. We call this a clone firm.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("live pipeline with mocked providers", () => {
  it("searches, cross-checks, and keeps only a cited flag on the sheet", async () => {
    const hosts: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      hosts.push(new URL(url).host);
      if (url.includes("api.tavily.com/search")) {
        const body = JSON.parse(String(init?.body)) as { query?: string; include_domains?: string[]; search_depth?: string };
        const domains = body.include_domains ?? [];
        const regulator = domains.length > 0 || /investor alert|news\/warnings|warning list|i-scan|red list/i.test(String(body.query));
        if (domains.includes(OFFICIAL.warningHost)) hosts.push(`include:${OFFICIAL.warningHost}`);
        const quoted = String(body.query).match(/"([^"]+)"/)?.[1] ?? "harbourdesk.example";
        return jsonResponse({
          request_id: "req_mock",
          usage: { credits: body.search_depth === "advanced" ? 2 : 1 },
          results: regulator
            ? [{ url: `https://www.${OFFICIAL.warningHost}/news/warnings/harbourdesk-example-clone`, title: quoted, content: `${quoted} is not authorised. We call this a clone firm.` }]
            : [],
        });
      }
      if (url.includes("api.tavily.com/")) return jsonResponse({ results: [], usage: { credits: 1 } });
      if (url.includes("rdap.org")) {
        return jsonResponse({ events: [{ eventAction: "registration", eventDate: "2024-01-02T00:00:00Z" }], registrar: "Example" });
      }
      if (url.includes("chat/completions")) {
        return jsonResponse({
          choices: [{
            message: {
              content: JSON.stringify({
                names: ["Harbour Desk"],
                hypotheses: [],
                questions: [],
                action: "stop",
                reason: "The regulator page is cited.",
                disputed: [],
                markdown: "The cited page shows scam risk indicators. Decision support only — not a determination of fraud.",
              }),
            },
          }],
          usage: { prompt_tokens: 12, completion_tokens: 24 },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const generator = runInvestigation({
      raw: "harbourdesk.example",
      context: "A site asking for an investment.",
      mode: "live",
      deps: {
        research: createTavilyResearch("tvly-mock", fetchImpl),
        rdap: createRdap(fetchImpl),
        screenshots: createScreenshotClient({}),
        llm: createNebius("nvapi-mock", fetchImpl),
        budget: new Budget(budgetDefaults()),
      },
    });

    let view = emptyCase();
    let step = await generator.next();
    while (!step.done) {
      view = reduceCase(view, step.value);
      step = await generator.next();
    }
    const report = step.value;
    expect(report.mode).toBe("live");
    expect(report.verdict.level).toBe("High");
    expect(report.red_flags.some((flag) => flag.signal_id === "R1")).toBe(true);
    expect(report.evidence.some((item) => item.quote.includes("clone firm"))).toBe(true);
    expect(report.memo).toMatch(/Decision support only/);
    expect(report.costs.nebius_usd).toBeGreaterThan(0);
    expect(hosts.filter((host) => !host.startsWith("include:")).every((host) => host === "api.tavily.com" || host === "rdap.org" || host === "api.tokenfactory.nebius.com")).toBe(true);
    expect(hosts).toContain(`include:${OFFICIAL.warningHost}`);
    expect(hosts).toContain("api.tavily.com");
    expect(hosts).toContain("api.tokenfactory.nebius.com");

    const sheet = sheetFromView(view);
    expect(sheet.level).toBe("High");
    expect(sheet.signals.some((signal) => signal.id === "R1")).toBe(true);
    expect(sheet.sources.some((source) => source.quote.includes("clone firm"))).toBe(true);
    expect(sheet.sources.some((source) => source.url.includes(`${OFFICIAL.warningHost}`))).toBe(true);
  });

  it("drops a flag whose evidence is missing and keeps a provider failure on the sheet", () => {
    const evidence = [{ evidence_id: "ev_01", quote: QUOTE, url: `https://www.${OFFICIAL.warningHost}/news/warnings/harbourdesk-example-clone`, title: "harbourdesk.example", source_domain: `${OFFICIAL.warningHost}`, source_type: "regulator" }] as Evidence[];
    const kept = { signal_id: "R1", title: "Exact match", explanation: "On a warning.", points: 40, weight: 50, evidence_ids: ["ev_01"], confidence: 1, source_reliability: 1, typologies: [], status: "active", hard: true, category: "other" } as RedFlag;
    const dropped = { ...kept, signal_id: "R2", title: "Loose match", evidence_ids: ["ev_missing"], points: 12 };
    const view = {
      ...emptyCase(),
      mode: "done" as const,
      label: "harbourdesk.example",
      input: "harbourdesk.example",
      evidence,
      flags: [kept, dropped],
      verdict: { level: "High" as const, score: 75, confidence: "Medium" as const, label: "High", hard_triggers: [], primary_typology: null, secondary_typology: null, budget_exhausted: false, degraded: false, radar: { investment_scam: 0, fake_shop: 0, impersonation: 0, app_mule: 0 }, manual_review: false },
      memo: "Advice only.\n\nThe stamp does not move money.",
    };
    const sheet = sheetFromView(view);
    expect(sheet.signals.map((signal) => signal.id)).toEqual(["R1"]);
    expect(sheet.memo).toHaveLength(2);

    const failed = sheetFromView({ ...emptyCase(), mode: "done", error: "The check timed out.", input: "harbourdesk.example" });
    expect(failed.error).toMatch(/timed out/);
    expect(failed.signals).toHaveLength(0);
  });

  it("makes one Tavily attempt on a 429, so the per-check call cap counts every HTTP request", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
      return jsonResponse({ results: [] });
    }) as typeof fetch;
    const research = createTavilyResearch("tvly-mock", fetchImpl);
    await expect(research.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 1 })).rejects.toThrow(/429/);
    expect(calls).toBe(1);
  });

  it("does not try the fallback model after a network error that may have been billed", async () => {
    let calls = 0;
    const llm = createNebius("nvapi-mock", (async () => {
      calls += 1;
      throw new Error("socket hang up");
    }) as typeof fetch);
    const result = await llm.complete({ task: "plan", model: "nvidia/Nemotron-3_5-Lightning", system: "json", user: "x", maxTokens: 20, temperature: 0 });
    expect(result.error).toBe("model_network");
    expect(calls).toBe(1);
  });

  it("sends one model request per call: no fallback after a 5xx or a 4xx", async () => {
    let calls = 0;
    const llm = createNebius("nvapi-mock", (async () => {
      calls += 1;
      return new Response("{}", { status: 503 });
    }) as typeof fetch);
    const ask = { task: "plan" as const, model: "nvidia/Nemotron-3_5-Lightning", system: "json", user: "x", maxTokens: 20, temperature: 0 };
    expect((await llm.complete(ask)).error).toBe("http_503");
    expect(calls).toBe(1);
    let refused = 0;
    const retried = createNebius("nvapi-mock", (async () => {
      refused += 1;
      return new Response("{}", { status: 404 });
    }) as typeof fetch);
    expect((await retried.complete(ask)).error).toBe("http_404");
    expect(refused).toBe(1);
    const research = createTavilyResearch("tvly-mock", (async () => new Response("{}", { status: 502 })) as typeof fetch);
    await expect(research.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 1 })).rejects.toMatchObject({ code: "upstream" });
  });

  it("keeps a missing usage count marked", async () => {
    const research = createTavilyResearch("tvly-mock", (async () => jsonResponse({ results: [] })) as typeof fetch);
    const result = await research.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 1 });
    expect(result.usageOmitted).toBe(true);
    expect(result.credits).toBe(1);
  });

  it("returns a model error instead of throwing when the provider times out", async () => {
    const fetchImpl = (async () => {
      throw new Error("The operation was aborted due to timeout");
    }) as typeof fetch;
    const llm = createNebius("nvapi-mock", fetchImpl);
    const result = await llm.complete({
      task: "normalize",
      model: "nvidia/Nemotron-3_5-Lightning",
      system: "json",
      user: "harbourdesk.example",
      maxTokens: 20,
      temperature: 0,
    });
    expect(result.json).toBeNull();
    expect(result.error).toBe("model_network");
  });

  it("scores an official clone warning as a hard High signal", () => {
    expect(classifySource(`${OFFICIAL.warningHost}`, "search_regulator")).toBe("regulator");
    expect(classifySource(`${OFFICIAL.redListHosts[0]}`, "search_reports")).toBe("regulator");
    expect(classifySource(`${REGULATOR_HOSTS.find((host) => host.endsWith(".org"))}`, "search_news")).toBe("regulator");
    expect(classifySource(`${OFFICIAL.registerHost}`, "search_regulator")).toBe("regulator");
    const entity = normalizeInput("The Quarnby Investment Bank");
    const drafts = detectSignals({
      entity,
      observations: [{
        action: "search_regulator",
        url: `https://www.${OFFICIAL.warningHost}/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm`,
        title: "Quarnby Investment Bank (clone of an FCO-authorised firm)",
        text: "This firm is not authorised by the FCO.",
        sourceDomain: `${OFFICIAL.warningHost}`,
        sourceType: "regulator",
        evidenceId: "ev_fco",
      }],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    const warning = drafts.find((draft) => draft.signal_id === "R1");
    expect(warning?.evidence_ids).toEqual(["ev_fco"]);
    const flag = warning ? draftToFlag(warning) : null;
    const verdict = scoreCase({
      flags: flag ? [flag] : [],
      independentSources: 1,
      floorComplete: true,
      budgetExhausted: false,
      degraded: false,
    });
    expect(verdict.level).toBe("High");
    expect(verdict.hard_triggers).toContain("R1");
    expect(verdict.score).toBeGreaterThanOrEqual(75);
    expect(flag?.points).toBeGreaterThanOrEqual(75);
    if (flag) flag.status = "disputed";
    const disputed = scoreCase({
      flags: flag ? [flag] : [],
      independentSources: 1,
      floorComplete: true,
      budgetExhausted: false,
      degraded: false,
    });
    expect(disputed.level).toBe("High");
    expect(disputed.hard_triggers).toContain("R1");
  });

  it("scores the official warning title as High and a register hit as a mitigation", () => {
    expect(regulatorSearchDomains()).toBe(REGULATOR_HOSTS);
    const entity = normalizeInput(FCO_LONDON_WARNING.name);
    const titled = detectSignals({
      entity,
      observations: [{
        action: "search_regulator",
        url: FCO_LONDON_WARNING.url.replace("fco.example", OFFICIAL.warningHost),
        title: FCO_LONDON_WARNING.title,
        text: FCO_LONDON_WARNING.title,
        sourceDomain: `${OFFICIAL.warningHost}`,
        sourceType: "regulator",
        evidenceId: "ev_title",
      }],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(titled.some((draft) => draft.signal_id === "M1")).toBe(false);
    expect(titled.some((draft) => draft.signal_id === "R1")).toBe(true);
    const titledFlag = titled.find((draft) => draft.signal_id === "R1");
    const titledVerdict = scoreCase({
      flags: titledFlag ? [draftToFlag(titledFlag)].filter((item) => item !== null) : [],
      independentSources: 1,
      floorComplete: true,
      budgetExhausted: false,
      degraded: false,
    });
    expect(titledVerdict.level).toBe("High");
    expect(titledVerdict.score).toBeGreaterThanOrEqual(75);
    const bare = detectSignals({
      entity,
      observations: [{
        action: "search_regulator",
        url: `https://www.${OFFICIAL.warningHost}/firms/the-quarnby-investment-bank`,
        title: FCO_LONDON_WARNING.name,
        text: FCO_LONDON_WARNING.text,
        sourceDomain: `${OFFICIAL.warningHost}`,
        sourceType: "regulator",
        evidenceId: "ev_text",
      }],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(bare.some((draft) => draft.signal_id === "R1")).toBe(false);
    const press = detectSignals({
      entity: normalizeInput("northgate-markets.example"),
      observations: [{
        action: "search_regulator",
        url: `https://www.${OFFICIAL.warningHost}/news/press-releases/fco-fines-northgate-groups-global-markets-limited`,
        title: "FCO fines Northgate Group's global markets business",
        text: "The FCO fined the genuine firm. The search snippet also says northgate-markets.example.",
        sourceDomain: `${OFFICIAL.warningHost}`,
        sourceType: "regulator",
        evidenceId: "ev_press",
      }],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(press.some((draft) => draft.signal_id === "R1")).toBe(false);
    const register = detectSignals({
      entity: normalizeInput("meridianbank.example"),
      observations: [{
        action: "verify_registration",
        url: `https://register.${OFFICIAL.warningHost}/s/firm/meridianbank.example`,
        title: "Meridian Bank",
        text: "Authorised and regulated by the FCO. Website: https://meridianbank.example",
        sourceDomain: `${OFFICIAL.warningHost}`,
        sourceType: "regulator",
        evidenceId: "ev_reg",
      }],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(register.some((draft) => draft.signal_id === "R1")).toBe(false);
    expect(register.some((draft) => draft.signal_id === "M1")).toBe(true);
    const echoed = detectSignals({
      entity: normalizeInput("harbourbank.com.sg"),
      observations: [{
        action: "search_regulator",
        url: `https://www.${OFFICIAL.registerHost}/regulation/enforcement/financial-institutions-directory.pdf`,
        title: "Financial Institutions Directory",
        text: "Financial Institutions Directory harbourbank.com.sg",
        sourceDomain: `${OFFICIAL.registerHost}`,
        sourceType: "regulator",
        evidenceId: "ev_echo",
      }],
      mapUrls: ["https://harbourbank.com.sg/", "https://harbourbank.com.sg/about"],
      ownSiteText: "HARBOURBANK homepage",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(echoed.some((draft) => draft.signal_id === "M1" || draft.signal_id === "R1" || draft.signal_id === "S1" || draft.signal_id === "S2")).toBe(false);
    const fidPage = {
      action: "search_regulator",
      url: `https://eservices.${OFFICIAL.registerHost}/fid/institution/detail/900002-HARBOURBANK-BANK-LTD`,
      title: "HARBOURBANK BANK LTD.",
      text: "Financial Institutions Directory\nHARBOURBANK BANK LTD.\nIncorporated in Singapore\nDesignated Payment System Settlement Institution\ncontact\nhttp://www.harbourbank.com\n+65 0000 0002",
      sourceDomain: `eservices.${OFFICIAL.registerHost}`,
      sourceType: "regulator" as const,
      evidenceId: "ev_fid",
    };
    const licensed = detectSignals({
      entity: normalizeInput("harbourbank.com.sg"),
      observations: [fidPage],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(licensed.some((draft) => draft.signal_id === "M1")).toBe(true);
    expect(licensed.some((draft) => draft.signal_id === "R1")).toBe(false);
    const otherBank = detectSignals({
      entity: normalizeInput("harbourbank-secure.com.sg"),
      observations: [fidPage],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(otherBank.some((draft) => draft.signal_id === "M1")).toBe(false);
    const kept = rankSearchHits(
      [{ url: fidPage.url, title: fidPage.title, content: fidPage.text }],
      normalizeInput("harbourbank.com.sg"),
    );
    expect(kept.map((hit) => hit.url)).toEqual([fidPage.url]);
    const titleOnly = { url: fidPage.url, title: "HARBOURBANK BANK LTD.", content: "HARBOURBANK BANK LTD." };
    expect(rankSearchHits([titleOnly], normalizeInput("harbourbank.com.sg")).map((hit) => hit.url)).toEqual([fidPage.url]);
    expect(rankSearchHits([titleOnly], normalizeInput("harbourbank-secure.com.sg"))).toEqual([]);
    expect(rankSearchHits([{ url: fidPage.url, title: fidPage.title, content: fidPage.text }], normalizeInput("northgate-markets.example"))).toEqual([]);
    const captureUrls = [
      `https://eservices.${OFFICIAL.registerHost}/fid/institution/detail/900001-HARBOURBANK-DIGITAL-EXCHANGE-PTE-LTD`,
      `https://eservices.${OFFICIAL.registerHost}/fid/institution/detail/900002-HARBOURBANK-BANK-LTD`,
      `https://eservices.${OFFICIAL.registerHost}/fid/institution/detail/900003-HARBOURBANK-TRUSTEE-LIMITED`,
      `https://eservices.${OFFICIAL.registerHost}/fid/institution?term=harbourbank+bank`,
    ];
    expect(pickInstitutionProfile(captureUrls, normalizeInput("harbourbank.com.sg"))).toBe(fidPage.url);
    expect(pickInstitutionProfile(captureUrls, normalizeInput("harbourbank-secure.com.sg"))).toBeNull();
    const lateSite = `${"directory ".repeat(120)}http://www.harbourbank.com`;
    expect(registerEvidenceQuote(fidPage.url, lateSite)).toContain("http://www.harbourbank.com");
    expect(registerEvidenceQuote(fidPage.url, lateSite).length).toBeLessThanOrEqual(900);
    const chromeFirst = `https://www.${OFFICIAL.registerHost}/fid ${"directory ".repeat(100)}http://www.harbourbank.com`;
    const windowed = registerEvidenceQuote(fidPage.url, chromeFirst);
    expect(windowed).toContain("http://www.harbourbank.com");
    expect(windowed.startsWith(`https://www.${OFFICIAL.registerHost}/fid`)).toBe(false);
    const captured = {
      action: "extract_pages" as const,
      url: fidPage.url,
      title: "Financial Institutions Directory",
      text: "Financial Institutions Directory\n# HARBOURBANK BANK LTD.\n## Licence Type/Status\n### Local Bank\n### Chairman\nPeter",
      sourceDomain: `${OFFICIAL.registerHost}`,
      sourceType: "regulator" as const,
      evidenceId: "ev_read",
    };
    expect(detectSignals({
      entity: normalizeInput("harbourbank.com.sg"),
      observations: [captured],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    }).some((draft) => draft.signal_id === "M1")).toBe(true);
    expect(detectSignals({
      entity: normalizeInput("harbourbank-secure.com.sg"),
      observations: [captured],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    }).some((draft) => draft.signal_id === "M1")).toBe(false);
    const warned = { ...captured, text: `${captured.text}\ninvestor alert` };
    expect(detectSignals({
      entity: normalizeInput("harbourbank.com.sg"),
      observations: [warned],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    }).some((draft) => draft.signal_id === "M1")).toBe(false);
    const digital = {
      ...fidPage,
      url: `https://eservices.${OFFICIAL.registerHost}/fid/institution/detail/900001-HARBOURBANK-DIGITAL-EXCHANGE-PTE-LTD`,
      evidenceId: "ev_digital",
      text: "Licence Type/Status\nLocal Bank\nhttp://www.harbourbank.com",
    };
    expect(detectSignals({
      entity: normalizeInput("harbourbank.com.sg"),
      observations: [digital, warned],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    }).some((draft) => draft.signal_id === "M1")).toBe(false);
    expect(detectSignals({
      entity: normalizeInput("harbourbank.com.sg"),
      observations: [digital, captured],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    }).some((draft) => draft.signal_id === "M1")).toBe(true);
    const otherSite = { ...captured, text: `${captured.text}\nhttp://www.other-bank.com` };
    expect(detectSignals({
      entity: normalizeInput("harbourbank.com.sg"),
      observations: [otherSite],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: true,
    }).some((draft) => draft.signal_id === "M1")).toBe(false);
    const parent = detectSignals({
      entity: normalizeInput("northgate-markets.example"),
      observations: [{
        action: "search_news",
        url: "https://www.wirepoint.example/markets/northgate-markets-outlook",
        title: "Northgate Markets outlook",
        text: "The Securities Oversight Board (SOB) advisory mentions Northgate Group. Query echo: northgate-markets.example.",
        sourceDomain: "wirepoint.example",
        sourceType: "news",
        evidenceId: "ev_outlook",
      }],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: false,
    });
    expect(parent.some((draft) => draft.signal_id === "R1" || draft.signal_id === "R3")).toBe(false);
    const pressPage = (domain: string, id: string) => ({
      action: "search_news" as const,
      url: `https://${domain}/sob-flags-fake-shopwisp-example`,
      title: "SOB flags fake SHOPWISP.EXAMPLE platform",
      text: `${OFFICIAL.warningName} flags SHOPWISP.EXAMPLE as fraudulent.`,
      sourceDomain: domain,
      sourceType: "news" as const,
      evidenceId: id,
    });
    const oneReport = detectSignals({
      entity: normalizeInput("SHOPWISP.EXAMPLE"),
      observations: [pressPage("daily-quay.example", "ev_news")],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: false,
    });
    expect(oneReport.some((draft) => draft.signal_id === "R3")).toBe(false);
    const oneVerdict = scoreCase({
      flags: [],
      independentSources: 1,
      floorComplete: true,
      budgetExhausted: false,
      degraded: false,
    });
    expect(oneVerdict.level).not.toBe("High");
    expect(oneVerdict.hard_triggers).not.toContain("R3");
    const twoReport = detectSignals({
      entity: normalizeInput("SHOPWISP.EXAMPLE"),
      observations: [pressPage("daily-quay.example", "ev_news"), pressPage("daily-quay.example", "ev_same"), pressPage("second-paper.example", "ev_other")],
      mapUrls: [],
      ownSiteText: "",
      ageDays: null,
      copycats: [],
      vision: null,
      registrationChecked: false,
    });
    const twoFlag = twoReport.find((draft) => draft.signal_id === "R3");
    const twoVerdict = scoreCase({
      flags: twoFlag ? [draftToFlag(twoFlag)].filter((item) => item !== null) : [],
      independentSources: 2,
      floorComplete: true,
      budgetExhausted: false,
      degraded: false,
    });
    expect(twoVerdict.level).toBe("High");
    expect(twoVerdict.hard_triggers).toContain("R3");
    expect(twoVerdict.score).toBeGreaterThanOrEqual(60);
    const brand = BRAND_DOMAINS.find((item) => item.domain.endsWith(".com"))!;
    const bank = normalizeInput(brand.domain);
    const official = detectSignals({
      entity: bank,
      observations: [{
        action: "extract_pages",
        url: `https://www.${brand.domain}/legal`,
        title: brand.name,
        text: "Customer accounts and payments.",
        sourceDomain: brand.domain,
        sourceType: "own_site",
        evidenceId: "ev_official_brand",
      }],
      mapUrls: [
        `https://www.${brand.domain}/terms`,
        `https://www.${brand.domain}/privacy`,
        `https://www.${brand.domain}/refund`,
        `https://www.${brand.domain}/contact`,
      ],
      ownSiteText: "Customer accounts and payments. Refunds are issued to the original method.",
      ageDays: 4000,
      copycats: [],
      vision: null,
      registrationChecked: true,
    });
    expect(official.some((draft) => draft.signal_id === "R1")).toBe(false);
    expect(official.some((draft) => draft.signal_id === "M4")).toBe(true);
    const bankVerdict = scoreCase({
      flags: official.map((draft) => draftToFlag(draft)).filter((flag): flag is RedFlag => flag !== null),
      independentSources: 1,
      floorComplete: true,
      budgetExhausted: false,
      degraded: false,
    });
    expect(bankVerdict.level).toBe("Low");
    expect(bankVerdict.hard_triggers).toEqual([]);
  });

  it("renders a finished report on the sheet when the earlier events never arrived", () => {
    const report = {
      case_id: "cs_london",
      input: {
        raw: "The Quarnby Investment Bank",
        context: "",
        entity_type: "merchant_name",
        canonical: { names: ["The Quarnby Investment Bank"] },
      },
      verdict: {
        level: "High",
        score: 48,
        confidence: "Medium",
        label: "High",
        hard_triggers: ["R1"],
        primary_typology: "investment_scam",
        secondary_typology: null,
        budget_exhausted: false,
        degraded: false,
        radar: { investment_scam: 48, fake_shop: 0, impersonation: 0, app_mule: 0 },
        manual_review: false,
      },
      red_flags: [{
        signal_id: "R1",
        title: "Exact match on a regulator warning or alert list",
        weight: 50,
        confidence: 1,
        source_reliability: 1,
        points: 48,
        typologies: ["investment_scam"],
        status: "active",
        evidence_ids: ["ev_fco"],
        explanation: "Named on an FCO warning.",
        hard: true,
        category: "other",
      }],
      mitigations: [],
      evidence: [{
        evidence_id: "ev_fco",
        kind: "web_page",
        url: `https://www.${OFFICIAL.warningHost}/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm`,
        title: "Quarnby Investment Bank",
        source_domain: `${OFFICIAL.warningHost}`,
        source_type: "regulator",
        retrieved_at: "",
        tool: { name: "search_regulator", credits: 2 },
        quote: "This firm is not authorised by the FCO.",
        content_sha256: "",
      }],
      memo: "Advice only.",
      costs: { tavily_credits: 29, llm_tokens: { in: 1, out: 1 }, nebius_usd: 0.018, usd_est: 0.2, wall_ms: 1000 },
      timings: { wall_ms: 1000 },
      versions: { rubric: "1", prompts: "1", app: "1" },
      mode: "live",
      trace: [],
    } as CaseReport;
    const view = applyFinishedReport({ ...emptyCase(), mode: "running", input: "The Quarnby Investment Bank", label: "The Quarnby Investment Bank" }, report);
    const sheet = sheetFromView(view);
    expect(sheet.subject).toBe("The Quarnby Investment Bank");
    expect(sheet.score).toBe(48);
    expect(sheet.stamp).toBe("High risk");
    expect(sheet.signals.map((signal) => signal.id)).toEqual(["R1"]);
    expect(sheet.sources[0]?.quote).toContain("not authorised");
    const events = [
      { case_id: "cs_london", seq: 2, ts: "", type: "tool.finished", payload: { credits: 8 } },
      { case_id: "cs_london", seq: 3, ts: "", type: "tool.finished", payload: { credits: 21 } },
    ] as AgentEvent[];
    expect(tavilyCreditsForRun(events, report)).toBe(29);
    expect(nebiusUsdForRun(report)).toBe(0.018);
    expect(recordedReplayMayStart("", false)).toBe(true);
    expect(recordedReplayMayStart("quantumyield.example", false, "quantumyield.example")).toBe(true);
    expect(recordedReplayMayStart("changed.example", false, "quantumyield.example")).toBe(false);
    expect(recordedReplayMayStart("The Quarnby Investment Bank", false)).toBe(false);
    expect(recordedReplayMayStart("", true)).toBe(false);
    expect(openingReplayInput(true, "quantumyield.example", "quantumyield.example")).toBe("");
    expect(openingReplayInput(false, "quantumyield.example", "")).toBe("quantumyield.example");
  });
});

describe("billed provider redirects", () => {
  it("are not followed, so one reservation never covers a second request", async () => {
    let calls = 0;
    const redirecting = (async () => {
      calls += 1;
      return new Response(null, { status: 307, headers: { location: "/again" } });
    }) as typeof fetch;
    const research = createTavilyResearch("tvly-mock", redirecting);
    await expect(research.search({ action: "search_reports", query: "harbour", depth: "basic", maxResults: 1 })).rejects.toThrow();
    expect(calls).toBe(1);
    calls = 0;
    const llm = createNebius("nvapi-mock", redirecting);
    expect((await llm.complete({ task: "plan", model: "m", system: "", user: "x", maxTokens: 10, temperature: 0 })).error).toBe("http_307");
    expect(calls).toBe(1);
  });
});
