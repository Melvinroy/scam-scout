import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CountUp } from "@/components/ui/CountUp";

it("hides the animated number and exposes the final value to assistive technology", () => {
  for (const value of [0, 72, 100]) {
    const html = renderToStaticMarkup(createElement(CountUp, { value }));
    expect(html).toMatch(new RegExp(`<span[^>]*aria-hidden="true"[^>]*>${value}</span>`));
    expect(html).toContain(`<span class="sr-only">${value}</span>`);
  }
});

vi.mock("@/lib/state/stores", () => ({ useCase: () => ({ mode: "idle" }) }));
vi.mock("@/lib/ui/live-sheet", async (load) => ({ ...await load<object>(), sheetFromView: () => ({ subject: "Test", score: 75, chips: [], mix: [], signals: [], sources: [], memo: [] }) }));
it("exposes labelled headline scores outside hidden ancestors in server markup", async () => {
  const { Scorecard } = await import("@/components/hud/Scorecard");
  const { LiveSheet } = await import("@/components/hud/LiveSheet");
  const { PUBLIC_CASES, scoreOf } = await import("@/lib/ui/public-evidence");
  for (const [element, gauge, score] of [
    [createElement(Scorecard, { item: PUBLIC_CASES[0] }), "score-gauge", scoreOf(PUBLIC_CASES[0])],
    [createElement(LiveSheet), "dash-gauge", 75],
  ] as const) {
    const html = renderToStaticMarkup(element);
    expect(html).toContain(`<div class="${gauge}"><svg viewBox="0 0 120 104" aria-hidden="true">`);
    expect(html).toContain(`<span class="sr-only">Risk score: ${score} of 100</span>`);
  }
});
