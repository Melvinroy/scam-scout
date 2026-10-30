import { describe, expect, it } from "vitest";
import { TRUST_BAND } from "@/lib/ui/trust-band";

describe("trust band", () => {
  it("promises evidence and advice without describing internal controls", () => {
    expect(TRUST_BAND.map((item) => item.id)).toEqual(["evidence", "recorded", "intake", "advisory"]);
    const spoken = TRUST_BAND.map((item) => `${item.title} ${item.line}`).join(" ");
    expect(spoken).toMatch(/links to the page/);
    expect(spoken).toMatch(/Advice only/);
    expect(spoken).not.toMatch(/\b(SOC|ISO|PCI|HIPAA|GDPR|certified|compliant|bank-grade|FSCS)\b|no PII/i);
    for (const item of TRUST_BAND) expect(item.line.length).toBeLessThan(120);
  });
});
