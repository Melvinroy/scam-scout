import { describe, expect, it } from "vitest";
import { SCAM_TYPES } from "@/lib/ui/scam-types";
import { PUBLIC_CASES } from "@/lib/ui/public-evidence";

describe("example scam types", () => {
  it("opens only illustrative cases and uses fictional sources", () => {
    const ids = new Set(PUBLIC_CASES.map((item) => item.id));
    expect(SCAM_TYPES.filter((item) => item.caseId).map((item) => item.id)).toEqual(["clone", "bank", "investment"]);
    for (const item of SCAM_TYPES) {
      if (item.caseId) expect(ids.has(item.caseId)).toBe(true);
      expect(new URL(item.url).hostname.endsWith(".example")).toBe(true);
      expect(item.line.length).toBeLessThan(160);
    }
    const spoken = SCAM_TYPES.map((item) => `${item.title} ${item.line}`).join(" ");
    expect(spoken).toMatch(/Clone firm/);
    expect(spoken).toMatch(/Bank impersonation/);
    expect(spoken).not.toMatch(/Quantum|Jordan Lee|Bright Parcel|Meridian|Nemotron/);
  });
});