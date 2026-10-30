import { chromium, expect, test } from "@playwright/test";
import lighthouse from "lighthouse";

// The kill-switch server, so the audit never starts a live check.
const SITE = "http://127.0.0.1:3212";
const PORT = 9333;
const BUDGET = { accessibility: 95, "best-practices": 95, performance: 85 } as const;

test("home, /demo and /sign-in meet the Lighthouse budgets", async () => {
  test.setTimeout(300_000);
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
  try {
    for (const path of ["/", "/demo", "/sign-in"]) {
      const result = await lighthouse(`${SITE}${path}`, { port: PORT, output: "json", logLevel: "error" }, {
        extends: "lighthouse:default",
        settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttlingMethod: "simulate", throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 }, onlyCategories: Object.keys(BUDGET) },
      });
      const scores = Object.fromEntries(Object.keys(BUDGET).map((id) => [id, Math.round((result?.lhr.categories[id]?.score ?? 0) * 100)]));
      console.log(`lighthouse ${path} ${JSON.stringify(scores)}`);
      for (const [id, floor] of Object.entries(BUDGET)) expect(scores[id], `${path} ${id}`).toBeGreaterThanOrEqual(floor);
    }
  } finally {
    await browser.close();
  }
});
