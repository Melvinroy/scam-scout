import type { BudgetSnapshot } from "@/lib/types";

export interface BudgetLimits {
  maxSteps: number;
  maxCredits: number;
  maxWallMs: number;
  maxTokens: number;
  maxScreenshots: number;
  maxPages: number;
}

export class Budget {
  steps = 0;
  credits = 0;
  tokensIn = 0;
  tokensOut = 0;
  /** Nebius USD from the calls that returned, at the model price. */
  modelUsd = 0;
  screenshots = 0;
  pages = 0;
  exhausted = false;
  degraded = false;
  failures = new Map<string, number>();
  readonly started = Date.now();

  constructor(private readonly limits: BudgetLimits) {}

  wallMs(now = Date.now()): number {
    return now - this.started;
  }

  wallLimitMs(): number {
    return this.limits.maxWallMs;
  }

  snapshot(now = Date.now()): BudgetSnapshot {
    return {
      steps: this.steps,
      credits: round1(this.credits),
      tokens_in: this.tokensIn,
      tokens_out: this.tokensOut,
      screenshots: this.screenshots,
      pages: this.pages,
      wall_ms: this.wallMs(now),
      exhausted: this.exhausted,
      degraded: this.degraded,
    };
  }

  noteTime(now = Date.now()): void {
    if (this.wallMs(now) > this.limits.maxWallMs) this.exhausted = true;
  }

  tryCredits(amount: number): boolean {
    this.noteTime();
    if (this.exhausted) return false;
    if (this.credits + amount > this.limits.maxCredits) {
      this.exhausted = true;
      return false;
    }
    this.credits += amount;
    return true;
  }

  addCredits(amount: number): void {
    this.credits = Math.max(0, this.credits + amount);
    if (this.credits > this.limits.maxCredits) this.exhausted = true;
  }

  tryStep(): boolean {
    this.noteTime();
    if (this.exhausted) return false;
    if (this.steps >= this.limits.maxSteps) {
      this.exhausted = true;
      return false;
    }
    this.steps += 1;
    return true;
  }

  tryScreenshot(): boolean {
    if (this.screenshots >= this.limits.maxScreenshots) return false;
    this.screenshots += 1;
    return true;
  }

  tryPages(count: number): number {
    const room = this.limits.maxPages - this.pages;
    const allowed = Math.max(0, Math.min(room, count));
    this.pages += allowed;
    return allowed;
  }

  addTokens(input: number, output: number): void {
    this.tokensIn += input;
    this.tokensOut += output;
    if (this.tokensIn + this.tokensOut > this.limits.maxTokens) this.exhausted = true;
  }

  addModelUsd(usd: number): void {
    if (Number.isFinite(usd) && usd > 0) this.modelUsd += usd;
  }

  fail(tool: string): number {
    const next = (this.failures.get(tool) ?? 0) + 1;
    this.failures.set(tool, next);
    if (next >= 2) this.degraded = true;
    return next;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
