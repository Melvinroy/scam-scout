import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    url: "http://127.0.0.1:3210/api/health",
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
