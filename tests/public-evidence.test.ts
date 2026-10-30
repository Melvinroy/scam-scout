import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Examples } from "@/components/landing/Examples";
import { EvidenceMap } from "@/components/hud/EvidenceMap";
import { describe, expect, it } from "vitest";
import { PUBLIC_CASES, levelOf, publicCaseFor, scoreOf } from "@/lib/ui/public-evidence";

describe("public evidence board", () => {
  it("provides two illustrative cases with fictional source hosts", () => {
    expect(PUBLIC_CASES.map((item) => item.id)).toEqual(["quarnby-investment-bank", "northgate-markets"]);
    for (const item of PUBLIC_CASES) {
      expect(item).not.toHaveProperty("retrieved");
      expect(item.nodes.length).toBeGreaterThanOrEqual(3);
      const urls = item.nodes.map((node) => node.url);
      expect(new Set(urls).size).toBe(urls.length);
      for (const node of item.nodes) {
        expect(node).not.toHaveProperty("httpStatus");
        expect(node).not.toHaveProperty("retrieved");
        expect(node.url.startsWith("https://")).toBe(true);
        expect(node.quote.length).toBeGreaterThan(40);
        expect(node.finding.length).toBeGreaterThan(10);
        expect(new URL(node.url).hostname.endsWith(".example")).toBe(true);
      }
    }
  });

  it("scores only cited tiles and leaves gaps explicit", () => {
    const london = PUBLIC_CASES[0];
    const northgate = PUBLIC_CASES[1];
    expect(scoreOf(london)).toBe(75);
    expect(scoreOf(northgate)).toBe(95);
    expect(levelOf(scoreOf(london))).toBe("High");
    expect(levelOf(scoreOf(northgate))).toBe("High");
    for (const item of PUBLIC_CASES) {
      expect(scoreOf(item)).toBe(item.tiles.reduce((sum, tile) => sum + tile.points, 0));
      for (const tile of item.tiles) {
        if (tile.tone === "unknown") {
          expect(tile.points).toBe(0);
          expect(tile.finding).toBe("Not in the cited sources");
        } else {
          expect(tile.points).toBeGreaterThan(0);
        }
      }
      expect(item.tiles.map((tile) => tile.id)).toEqual(["regulator", "contact", "domain", "reviews", "payment", "site"]);
    }
    expect(london.tiles.find((tile) => tile.id === "domain")?.tone).toBe("unknown");
    expect(northgate.tiles.find((tile) => tile.id === "domain")?.finding).toContain("14 Jan 2026");
    expect(northgate.nodes.find((node) => node.id === "rdap")?.quote).toContain("2026-01-14T17:32:37Z");
    expect(northgate.nodes.find((node) => node.id === "trustlens")?.quote).toContain("unsure if the website is legit");
  });

  it("opens the recorded case for those domains and does not invent a payment method", () => {
    expect(publicCaseFor("https://www.quarnby-markets.example/")?.id).toBe("quarnby-investment-bank");
    expect(publicCaseFor("+1 202 555 0101")?.id).toBe("quarnby-investment-bank");
    expect(publicCaseFor("northgate-markets.example")?.id).toBe("northgate-markets");
    expect(publicCaseFor("quantumyield.example")).toBeUndefined();
    for (const item of PUBLIC_CASES) {
      expect(item.tiles.find((tile) => tile.id === "payment")?.finding).toBe("Not in the cited sources");
      expect(item.memo.join(" ")).toMatch(/not a fraud finding/i);
      expect(item.memo.join(" ")).toMatch(/Financial Conduct Office (FCO)|FCO/);
    }
  });
});

describe("hero example picks", () => {
  it("offers 3 or 4 picks, and each one opens a recorded case when checked", async () => {
    const { EXAMPLE_PICKS } = await import("@/lib/ui/public-evidence");
    expect(EXAMPLE_PICKS.length).toBeGreaterThanOrEqual(3);
    expect(EXAMPLE_PICKS.length).toBeLessThanOrEqual(4);
    for (const pick of EXAMPLE_PICKS) expect(publicCaseFor(pick.value)?.id).toBeTruthy();
    expect(publicCaseFor("+1 202 555 0101")?.id).toBe("quarnby-investment-bank");
  });
});

it("labels fictional evidence and descriptions and renders sources without outbound links", () => {
  const views = [
    renderToStaticMarkup(createElement(Examples, { onOpen: () => {} })),
    ...PUBLIC_CASES.flatMap((item) => [
      renderToStaticMarkup(createElement(HowItWorks, { caseId: item.id })),
      renderToStaticMarkup(createElement(EvidenceMap, { item })),
    ]),
  ];
  for (const html of views) {
    expect(html).toContain("Illustrative example — names and sites are fictional");
    expect(html).not.toMatch(/<a\b|Retrieved|HTTP 200|2026-10-21/);
  }
});
