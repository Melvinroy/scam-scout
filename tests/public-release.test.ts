import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publicReplayResponses } from "@/scripts/public-replay-responses";
import { BUILT_COMPATIBILITY_TOKENS, builtTrademarkViolations, presentationSource, trademarkMatches } from "@/scripts/trademark-scan.mjs";
import { PUBLIC_CASES, EXAMPLE_PICKS } from "@/lib/ui/public-evidence";
import { FIXTURES } from "@/fixtures/cases";
import { publicPayload } from "@/lib/replay/public";
import { BRAND_DOMAINS } from "@/lib/agent/lookalike";
import { detectSignals, classifySource, type DetectContext, type Observation } from "@/lib/agent/detect";
import { normalizeInput } from "@/lib/agent/normalize";
import { OFFICIAL } from "@/lib/agent/regulator-data";
import { isInstitutionProfile, isRegulatorHost } from "@/lib/agent/surface";
import { riskColor } from "@/lib/ui/cast";

const terms = readFileSync("scripts/trademark-denylist.txt", "utf8").split(/\r?\n/).filter((term) => term && !term.startsWith("#"));
const context = (observations: Observation[], replay = false): DetectContext => ({
  entity: normalizeInput("merchant.example"), observations, replay,
  mapUrls: [], ownSiteText: "", ageDays: null, copycats: [], vision: null, registrationChecked: true,
});
const observation = (url: string, text: string, action = "search_news"): Observation => ({
  action, url, text, title: "merchant.example", sourceDomain: new URL(url).hostname,
  sourceType: "regulator", evidenceId: url,
});

describe("public release boundaries", () => {
  it("keeps the environment template blank with neutral configuration comments", () => {
    const lines = readFileSync(".env.example", "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      const valid = line.trimStart().startsWith("#")
        ? !/sessionStorage|allowlist|judge|quota|ledger/i.test(line)
        : /^[A-Z_][A-Z0-9_]*=\s*$/.test(line);
      expect(valid, `.env.example line ${index + 1}`).toBe(true);
    }
  });

  it("scans every generated replay JSON and SSE response for prohibited names and query previews", async () => {
    const responses = await publicReplayResponses();
    expect(responses.length).toBeGreaterThanOrEqual(FIXTURES.length);
    for (const { id, json, sse } of responses) {
      expect(trademarkMatches(json, terms), `${id} JSON`).toEqual([]);
      expect(trademarkMatches(sse, terms), `${id} SSE`).toEqual([]);
      expect(json + sse).not.toMatch(/args_preview|"query"/);
      const pack = JSON.parse(json);
      expect(pack.events.length).toBeGreaterThan(0);
      expect(pack.report.evidence.length).toBeGreaterThan(0);
    }
  });

  it("projects tool and decision payloads to presentation fields, including old captures", () => {
    for (const type of ["tool.started", "tool.finished", "tool.failed", "agent.decision"]) {
      const event = { type, payload: { action: "search_regulator", destination: "regulator", args_preview: OFFICIAL.warningQuery, query: OFFICIAL.redListQuery, title: OFFICIAL.warningHost, future_internal: OFFICIAL.warningName } };
      expect(publicPayload(event)).toEqual({ type, payload: { action: "search_regulator", destination: "regulator" } });
      expect(publicPayload({ capture: { events: [event] } })).toHaveProperty("capture.events", [publicPayload(event)]);
    }
  });

  it("keeps all public fictional identities, aliases, emails and evidence on reserved domains", () => {
    // Include free text as well as URL fields so emails and quoted websites cannot escape.
    const text = JSON.stringify([PUBLIC_CASES, EXAMPLE_PICKS, FIXTURES])
      .replace(/https?:\/\/([^/\\\s"]+)[^\\\s"]*/g, "$1")
      .replace(/\b[\w.+-]+@/g, "");
    const hosts = [...text.matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi)].map(([host]) => host.toLowerCase());
    expect(hosts.length).toBeGreaterThan(20);
    expect(hosts.filter((host) => !host.endsWith(".example") && !/^(?:.*\.)?example\.(com|org|net)$/.test(host))).toEqual([]);
  });

  it("keeps brand classification while emitting generic detection explanations", () => {
    for (const brand of BRAND_DOMAINS.filter((item) => item.domain.endsWith(".com"))) {
      for (const [domain, signal] of [[brand.domain, "M4"], [brand.domain.replace(".com", "-login.example"), "S6"]]) {
        const ctx = context([observation(`https://${domain}`, "Customer accounts", "extract_pages")]);
        ctx.entity = normalizeInput(domain);
        const draft = detectSignals(ctx).find((item) => item.signal_id === signal);
        expect(draft, domain).toBeDefined();
        expect(trademarkMatches(draft!.explanation!, terms)).toEqual([]);
      }
    }
  });

  it("projects older signal explanations and model-derived findings to approved copy", () => {
    for (const signal_id of ["M4", "S5", "S6", "V1", "V2", "V3"]) {
      const signal = publicPayload({ signal_id, explanation: OFFICIAL.warningName });
      expect(trademarkMatches(JSON.stringify(signal), terms)).toEqual([]);
    }
    const ctx = context([observation("https://merchant.example", "storefront", "screenshot")]);
    ctx.copycats = [OFFICIAL.warningHost];
    ctx.vision = { finding: OFFICIAL.warningName, impersonation: true, impersonationKind: "government", stockPhoto: true, fakeBadges: true, confidence: 1, skipped: false };
    const drafts = detectSignals(ctx);
    expect(drafts.map((draft) => draft.signal_id)).toEqual(expect.arrayContaining(["S5", "V1", "V2", "V3"]));
    for (const draft of drafts) expect(trademarkMatches(draft.explanation!, terms)).toEqual([]);
  });

  it("requires replay mode for fictional regulator names, hosts and register aliases", () => {
    for (const name of ["Financial Conduct Office", "Harbour Monetary Authority", "Securities Oversight Board", "FCO", "HMA", "SOB", "ISOCB", "DTSB", "Harbour Post"]) {
      const observations = ["news-one.example", "news-two.example"].map((host) => observation(`https://${host}/merchant.example`, `${name} warns merchant.example is not authorised.`));
      expect(detectSignals(context(observations)).some((signal) => /^R[123]$|^M1$/.test(signal.signal_id)), name).toBe(false);
      expect(detectSignals(context(observations, true)).some((signal) => signal.signal_id === "R3"), name).toBe(true);
    }
    for (const host of ["fco.example", "hma.example", "sob.example", "alerts.example", "register.example"]) {
      expect(isRegulatorHost(host)).toBe(false);
      expect(classifySource(host, "search_regulator")).toBe("unknown");
      expect(classifySource(host, "search_regulator", true)).toBe("regulator");
      const obs = observation(`https://${host}/news/warnings/merchant.example`, "merchant.example is not authorised.", "search_regulator");
      expect(detectSignals(context([obs])).some((signal) => signal.signal_id === "R1")).toBe(false);
      expect(detectSignals(context([obs], true)).some((signal) => signal.signal_id === "R1")).toBe(true);
    }
    const profile = "https://eservices.hma.example/fid/institution/detail/1-MERCHANT-LTD";
    expect(isInstitutionProfile(profile)).toBe(false);
    expect(isInstitutionProfile(profile, true)).toBe(true);
    const obs = observation(profile, "Local Bank. Website: merchant.example", "search_regulator");
    expect(detectSignals(context([obs])).some((signal) => signal.signal_id === "M1")).toBe(false);
    expect(detectSignals(context([obs], true)).some((signal) => signal.signal_id === "M1")).toBe(true);
  });

  it("retains real warning and register classification during live detection", () => {
    const warning = observation(`https://${OFFICIAL.warningHost}/news/warnings/merchant.example`, "merchant.example is not authorised.", "search_regulator");
    const register = observation(`https://${OFFICIAL.profileHost}/fid/institution/detail/1-MERCHANT-LTD`, "Local Bank. Website: merchant.example", "search_regulator");
    expect(classifySource(OFFICIAL.warningHost, "search_regulator")).toBe("regulator");
    expect(classifySource(OFFICIAL.registerHost, "search_regulator")).toBe("regulator");
    expect(detectSignals(context([warning])).map((signal) => signal.signal_id)).toContain("R1");
    expect(detectSignals(context([register])).map((signal) => signal.signal_id)).toContain("M1");
  });

  it("gives every verdict text tone at least 4.5:1 contrast on white", () => {
    for (const level of ["High", "Medium", "Low", "Not enough evidence", undefined]) {
      const color = riskColor(level).slice(1);
      const linear = [0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const luminance = linear.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      expect(1.05 / (luminance + 0.05), level).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("trademark gate", () => {
  it("allows exact browser compatibility tokens without exempting surrounding copy", () => {
    const css = BUILT_COMPATIBILITY_TOKENS.join(";");
    expect(trademarkMatches(css, terms, { built: true })).toEqual([]);
    expect(trademarkMatches(`${css}; ${OFFICIAL.warningName}`, terms, { built: true })).toEqual([OFFICIAL.warningName]);
  });

  it("scans nested built bundles even when they are outside the tracked source inventory", () => {
    const root = mkdtempSync(join(tmpdir(), "scout-bundle-test-"));
    try {
      const directory = join(root, ".next/static/chunks");
      mkdirSync(directory, { recursive: true });
      const bundle = join(directory, "page.js");
      const escaped = [...OFFICIAL.warningName].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
      writeFileSync(bundle, `window.presentation = "${escaped}";`);
      expect(builtTrademarkViolations(join(root, ".next/static"), terms)).toEqual([{ file: bundle, term: OFFICIAL.warningName }]);
      writeFileSync(bundle, 'window.presentation = "An illustrative case";');
      expect(builtTrademarkViolations(join(root, ".next/static"), terms)).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("decodes Unicode, hexadecimal, nested JSON and regexp escapes in source and bundles", () => {
    const term = OFFICIAL.warningHost;
    const unicode = [...term].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
    const hex = [...term].map((c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("");
    const points = [...term].map((c) => `\\u{${c.charCodeAt(0).toString(16)}}`).join("");
    for (const text of [term, unicode, hex, points, JSON.stringify(unicode), term.replaceAll(".", "\\.")]) {
      expect(trademarkMatches(text, terms).length).toBeGreaterThan(0);
      expect(trademarkMatches(text, terms, { built: true }).length).toBeGreaterThan(0);
    }
  });

  it("exempts only named internal data constants and scans the rest of those files", () => {
    const literal = JSON.stringify(OFFICIAL.warningName);
    const data = `export const REGULATOR_NAME = ${literal};`;
    expect(trademarkMatches(presentationSource("lib/agent/detect.ts", data), terms)).toEqual([]);
    for (const file of ["lib/agent/detect.ts", "lib/agent/machine.ts", "lib/agent/policy.ts", "lib/agent/regulator-queries.ts", "fixtures/recorded/demo-cases.ts"]) {
      expect(trademarkMatches(presentationSource(file, `${data}\nexport const publicCopy = ${literal};`), terms).length, file).toBeGreaterThan(0);
    }
    const executable = `const REGULATOR_NAME = (() => ${literal})();`;
    expect(trademarkMatches(presentationSource("lib/agent/detect.ts", executable), terms).length).toBeGreaterThan(0);
  });
});
