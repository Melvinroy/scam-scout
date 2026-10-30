import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV_LINKS } from "@/components/site/site-nav";

const landing = readdirSync("components/landing").map((file) => readFileSync(`components/landing/${file}`, "utf8")).join("\n");

describe("site nav", () => {
  it("jumps only to sections that exist on the landing page", () => {
    const anchors = NAV_LINKS.filter((link) => !link.external).map((link) => link.href);
    expect(anchors.length).toBeGreaterThan(0);
    for (const href of anchors) {
      const [path, id] = href.split("#");
      expect(path).toBe("/");
      expect(landing).toContain(`id="${id}"`);
    }
  });
});
