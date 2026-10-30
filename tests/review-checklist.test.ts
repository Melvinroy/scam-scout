import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderedContrast } from "./helpers/rendered-contrast";
import { emptyCase } from "@/lib/case/reducer";
import { LiveSheet } from "@/components/hud/LiveSheet";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Landing } from "@/components/landing/Landing";
import { DemoConsole } from "@/components/demo/DemoConsole";
import { TrustBand } from "@/components/landing/TrustBand";
import { Examples } from "@/components/landing/Examples";
import { Scorecard } from "@/components/hud/Scorecard";
import { EvidenceMap } from "@/components/hud/EvidenceMap";
import { PUBLIC_CASES } from "@/lib/ui/public-evidence";
import type { RedFlag } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/state/stores", () => ({ useCase: () => ({
  ...emptyCase(),
  evidence: [{ evidence_id: "ev_m", quote: "Official listing", source_type: "regulator" }],
  mitigations: [{ signal_id: "M1", title: "Official listing", points: -15, explanation: "Registered", evidence_ids: ["ev_m"], status: "active" } as RedFlag],
}) }));

it("renders public tone text with at least 4.5:1 contrast, including mitigation points and selected chips", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const html = [
    renderToStaticMarkup(createElement(LiveSheet)),
    renderToStaticMarkup(createElement(TrustBand)),
    renderToStaticMarkup(createElement(DemoConsole, { openingReplay: true, initialId: "one", presets: [
      { id: "one", label: "High", blurb: "High", input: "one", expected: { verdict: "High", typology: null } },
      { id: "two", label: "Low", blurb: "Low", input: "two", expected: { verdict: "Low", typology: null } },
    ] })),
    renderToStaticMarkup(createElement(Examples, { onOpen: () => {} })),
    ...PUBLIC_CASES.flatMap((item) => [
      renderToStaticMarkup(createElement(HowItWorks, { caseId: item.id })),
      renderToStaticMarkup(createElement(Scorecard, { item })),
      renderToStaticMarkup(createElement(EvidenceMap, { item })),
    ]),
  ].join("");
  expect(html).not.toMatch(/class="dash-points num"[^>]*>-/);
  expect(html).toContain("Lowers risk");
  for (const selected of [false, true]) {
    const { failures, checked } = renderedContrast(css, html, selected);
    expect(checked).toContain("dash-points num");
    expect(checked).toContain("emap-kind");
    expect(checked).toContain("ex-kicker");
    expect(checked).toContain("ml-2");
    expect(checked).toContain("trust-name");
    expect(failures).toEqual([]);
  }
});


it("keeps example chip labels readable in both themes and selection states", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const chips = renderToStaticMarkup(createElement(Landing));
  const buttons = chips.match(/<button[^>]*class="chip example-pick"[\s\S]*?<\/button>/g)!;
  expect(buttons.length).toBeGreaterThan(1);
  for (const theme of ["", "night"]) {
    for (const selected of [false, true]) for (const button of buttons) {
      const { failures, checked } = renderedContrast(css, `<div class="${theme}" style="background:var(--color-bg)">${button}</div>`, selected);
      expect(checked).toContain("example-kind");
      expect(failures).toEqual([]);
    }
  }
});
