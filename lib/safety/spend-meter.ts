import type { LlmProvider, LlmResponse, ResearchProvider } from "@/lib/providers/types";
import {
  markSpendBroken,
  modelPrice,
  nebiusCallUsd,
  MAX_PROMPT_TOKENS,
  clampCompletionTokens,
  nebiusReserveUsd,
  promptTokenBound,
  resolveCredits,
  spendLedgerBroken,
  spendLimits,
  type SpendLedger,
  type SpendReservation,
  type SpendSnapshot,
} from "@/lib/safety/spend";

import { TAVILY_WORST } from "@/lib/safety/tavily-cost";

const CLOSED = { results: [] as [], credits: 0, error: "spend_limit" };

/** Hosted and bring-your-own provider calls. The reserve happens before the network call. */
export function meterResearch(inner: ResearchProvider, ledger: SpendLedger): ResearchProvider {
  return {
    async search(request) {
      const reserved = { usd: 0, tavilyCredits: TAVILY_WORST.search(request.depth) };
      const held = await take(ledger, reserved);
      if (!held.ok) return { ...CLOSED, error: held.reason ?? "spend_unreadable" };
      let result;
      try {
        result = await inner.search(request);
      } catch (error) {
        await keepReservation(ledger, reserved);
        throw error;
      }
      const counted = settleResearch(result, reserved);
      await finish(ledger, reserved, counted.actual, counted.invalid);
      return { ...result, credits: counted.actual.tavilyCredits };
    },
    async extract(urls, query) {
      const reserved = { usd: 0, tavilyCredits: TAVILY_WORST.extract(urls.length) };
      const held = await take(ledger, reserved);
      if (!held.ok) return { pages: [], failed: urls, credits: 0, error: held.reason ?? "spend_unreadable" };
      let result;
      try {
        result = await inner.extract(urls, query);
      } catch (error) {
        await keepReservation(ledger, reserved);
        throw error;
      }
      const counted = settleResearch(result, reserved);
      await finish(ledger, reserved, counted.actual, counted.invalid);
      return { ...result, credits: counted.actual.tavilyCredits };
    },
    async map(url) {
      const reserved = { usd: 0, tavilyCredits: TAVILY_WORST.map };
      const held = await take(ledger, reserved);
      if (!held.ok) return { urls: [], credits: 0, error: held.reason ?? "spend_unreadable" };
      let result;
      try {
        result = await inner.map(url);
      } catch (error) {
        await keepReservation(ledger, reserved);
        throw error;
      }
      const counted = settleResearch(result, reserved);
      await finish(ledger, reserved, counted.actual, counted.invalid);
      return { ...result, credits: counted.actual.tavilyCredits };
    },
    async crawl(url, instructions) {
      const reserved = { usd: 0, tavilyCredits: TAVILY_WORST.crawl };
      const held = await take(ledger, reserved);
      if (!held.ok) return { pages: [], credits: 0, error: held.reason ?? "spend_unreadable" };
      let result;
      try {
        result = await inner.crawl(url, instructions);
      } catch (error) {
        await keepReservation(ledger, reserved);
        throw error;
      }
      const counted = settleResearch(result, reserved);
      await finish(ledger, reserved, counted.actual, counted.invalid);
      return { ...result, credits: counted.actual.tavilyCredits };
    },
  };
}

export function meterLlm(inner: LlmProvider, ledger: SpendLedger): LlmProvider {
  return {
    live: inner.live,
    async complete(asked) {
      try {
        modelPrice(asked.model);
      } catch {
        return { text: "", json: null, model: asked.model, tokens: { in: 0, out: 0 }, error: "model_unpriced" };
      }
      // The reserve covers exactly what is sent: max_tokens is clamped first.
      const request = { ...asked, maxTokens: clampCompletionTokens(asked.maxTokens) };
      const prompt = promptTokenBound(request);
      if (prompt > MAX_PROMPT_TOKENS) return closedModel(request.model, { ok: false, reason: "spend_limit" });
      const reserved = { usd: nebiusReserveUsd(request.model, request.maxTokens, prompt), tavilyCredits: 0 };
      const held = await take(ledger, reserved);
      if (!held.ok) return closedModel(request.model, held);
      let result: LlmResponse;
      try {
        result = await inner.complete(request);
      } catch (error) {
        await keepReservation(ledger, reserved);
        throw error;
      }
      if (result.error) {
        // The request was sent, so any status or network failure may have been billed.
        await keepReservation(ledger, reserved);
        return result;
      }
      if (result.usageOmitted || !validTokens(result.tokens)) {
        await finish(ledger, reserved, reserved, true);
        return result;
      }
      await finish(ledger, reserved, { usd: nebiusCallUsd(request.model, result.tokens), tavilyCredits: 0 }, false);
      return result;
    },
  };
}

function settleResearch(
  result: { credits: number; usageOmitted?: boolean },
  reserved: SpendSnapshot,
): { actual: SpendSnapshot; invalid: boolean } {
  // No usage reading: charge the held worst case. The reservation already bounds it, so the ledger stays open.
  if (result.usageOmitted) return { actual: reserved, invalid: false };
  const counted = resolveCredits(result.credits, spendLimits().tavilyCredits);
  return { actual: { usd: 0, tavilyCredits: counted.credits }, invalid: counted.invalid };
}

async function take(ledger: SpendLedger, entry: SpendSnapshot): Promise<SpendReservation> {
  if (spendLedgerBroken()) return { ok: false, reason: "spend_unreadable" };
  try {
    return await ledger.reserve(entry, spendLimits());
  } catch {
    markSpendBroken();
    return { ok: false, reason: "spend_unreadable" };
  }
}

function closedModel(model: string, held: SpendReservation): LlmResponse {
  return { text: "", json: null, model, tokens: { in: 0, out: 0 }, error: held.reason ?? "spend_unreadable" };
}

async function finish(ledger: SpendLedger, reserved: SpendSnapshot, actual: SpendSnapshot, flagged: boolean): Promise<void> {
  // The reservation is the worst case. A count above it means the bound is wrong, so the ledger closes.
  const invalid = flagged || actual.usd > reserved.usd + 1e-9 || actual.tavilyCredits > reserved.tavilyCredits;
  if (invalid) {
    // Close before settling so no other isolate can reserve while this settlement is pending; keep the full hold.
    markSpendBroken();
    try {
      await ledger.close();
    } catch {
      markSpendBroken();
    }
  }
  // Settle at most what was reserved. The reserve kept the total under the cap, so the ledger can never pass it.
  const settled = invalid ? reserved : { usd: Math.min(actual.usd, reserved.usd), tavilyCredits: Math.min(actual.tavilyCredits, reserved.tavilyCredits) };
  try {
    await ledger.settle(reserved, settled);
  } catch {
    markSpendBroken();
  }
}

function validTokens(tokens: { in: number; out: number }): boolean {
  return [tokens.in, tokens.out].every((count) => Number.isSafeInteger(count) && count >= 0);
}

/** Every request that reached the network may have been billed, so the whole reservation stays. */
async function keepReservation(ledger: SpendLedger, reserved: SpendSnapshot): Promise<void> {
  try {
    await ledger.settle(reserved, reserved);
  } catch {
    markSpendBroken();
  }
}
