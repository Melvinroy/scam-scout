import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BYOK_PANEL_COPY } from "@/lib/ui/byok-copy";

describe("bring-your-own-keys panel copy", () => {
  it("names the capability without describing how keys or spend are handled", () => {
    expect(BYOK_PANEL_COPY).toBe("Run a check with your own research and model keys.");
    const panel = readFileSync("components/demo/ByokSettings.tsx", "utf8");
    expect(panel).toContain("{BYOK_PANEL_COPY}");
    expect(panel).not.toMatch(/this tab|server|Tavily|Nebius|cap\b/i);
  });
});
