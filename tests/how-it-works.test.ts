import { describe, expect, it } from "vitest";
import { HOW_CREDIT, HOW_STEPS } from "@/lib/ui/how-it-works";

describe("how it works copy", () => {
  it("is four moves, with vendor names only in the credit", () => {
    expect(HOW_STEPS.map((step) => step.id)).toEqual(["paste", "scouts", "cross-check", "verdict"]);
    const spoken = HOW_STEPS.map((step) => `${step.kicker} ${step.title} ${step.body}`).join(" ");
    expect(spoken).toMatch(/Paste a link or a number/);
    expect(spoken).toMatch(/Scouts search public sources/);
    expect(spoken).toMatch(/Evidence is cross-checked/);
    expect(spoken).toMatch(/Case file verdict/);
    expect(spoken).not.toMatch(/Nemotron|Tavily|Nebius|RibbonPay|Linecraft|Vercel/);
    expect(HOW_CREDIT).not.toMatch(/Tavily|Nebius/);
    for (const step of HOW_STEPS) {
      expect(step.body.length).toBeLessThan(120);
    }
  });
});
