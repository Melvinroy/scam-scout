import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The spend limits are required settings. Tests run at the enforced upper bounds.
    env: { SPEND_HARD_LIMIT_USD: "13.50", TAVILY_CREDIT_HARD_LIMIT: "400" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
