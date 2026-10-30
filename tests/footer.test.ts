import { describe, expect, it } from "vitest";
import { NAV_LINKS } from "@/components/site/site-nav";
import {
  CLOSE_LINE,
  CLOSE_TITLE,
  FOOTER_ADVICE,
  FOOTER_BUILDER,
  FOOTER_CREDIT,
  FOOTER_HACKATHON,
  FOOTER_MISSION,
} from "@/lib/ui/footer";

describe("footer", () => {
  it("names the builder, the advice, and the vendors only in the credit", () => {
    expect(NAV_LINKS.map((link) => link.title)).toEqual(["How it works", "Demo cases", "Open source"]);
    expect(FOOTER_MISSION.length).toBeLessThan(80);
    expect(FOOTER_BUILDER).toBe("Built by Melvin Roy, independent builder.");
    expect(FOOTER_ADVICE).toMatch(/Advice only/);
    expect(FOOTER_ADVICE).toMatch(/Not a fraud finding/);
    expect(FOOTER_HACKATHON).toMatch(/hackathon/i);
    expect(FOOTER_CREDIT).toBe("Built with web research and open models.");
    const elsewhere = [FOOTER_MISSION, FOOTER_BUILDER, FOOTER_ADVICE, FOOTER_HACKATHON, CLOSE_TITLE, CLOSE_LINE].join(" ");
    expect(elsewhere).not.toMatch(/Tavily|Nemotron|Nebius|Google|RibbonPay/);
    expect(elsewhere).not.toMatch(/SOC|ISO|certified|compliant/i);
    expect(CLOSE_TITLE).toBe("Before you pay.");
  });
});
