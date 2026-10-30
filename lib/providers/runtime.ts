import { Budget } from "@/lib/agent/budget";
import { budgetDefaults } from "@/lib/config";
import type { AgentDeps } from "@/lib/agent/machine";
import { emptyFixture, type FixtureCase } from "@/fixtures/cases";
import { createFixtureLlm, createFixtureRdap, createFixtureResearch, createFixtureScreenshots } from "@/lib/providers/fixture";
import { createNebius, createRdap, createScreenshotClient, createTavilyResearch } from "@/lib/providers/live";
import { getSpendLedger } from "@/lib/safety/spend";
import { meterLlm, meterResearch } from "@/lib/safety/spend-meter";
import { CheckCap, capLlm, capResearch, checkCapLimits } from "@/lib/safety/check-cap";

export function fixtureDeps(fixture: FixtureCase): AgentDeps {
  return {
    research: createFixtureResearch(fixture),
    rdap: createFixtureRdap(fixture),
    screenshots: createFixtureScreenshots(fixture),
    llm: createFixtureLlm(fixture),
    budget: new Budget(budgetDefaults()),
  };
}

export function liveDeps(
  env: NodeJS.ProcessEnv = process.env,
  keys?: { researchKey: string; modelKey: string },
): AgentDeps {
  const researchKey = keys ? keys.researchKey : (env.TAVILY_API_KEY ?? "");
  const modelKey = keys ? keys.modelKey : (env.NEBIUS_API_KEY ?? "");
  const ledger = getSpendLedger(env);
  const research = createTavilyResearch(researchKey);
  const llm = createNebius(modelKey);
  // One cap per check. It sits outside the spend meter, so a refused call reserves nothing.
  const cap = new CheckCap(checkCapLimits(env));
  return {
    research: capResearch(meterResearch(research, ledger), cap),
    rdap: createRdap(),
    screenshots: createScreenshotClient({
      workerUrl: env.SCREENSHOT_WORKER_URL,
      secret: env.SCREENSHOT_SHARED_SECRET,
    }),
    llm: capLlm(meterLlm(llm, ledger), cap),
    budget: new Budget(budgetDefaults()),
  };
}

export function unknownDeps(raw: string): AgentDeps {
  return fixtureDeps(emptyFixture(raw));
}
