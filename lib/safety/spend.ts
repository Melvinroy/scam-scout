import { imageTokenBound } from "@/lib/safety/image-bound";
import { runtimeEnv, TOKEN_PRICES } from "@/lib/config";

/** Hosted provider spend as lifetime totals that never reset. Redis only. A missing store refuses live checks. */

export interface SpendSnapshot {
  /** Model spend in total, all time. */
  usd: number;
  /** Tavily credits used in total, all time. */
  tavilyCredits: number;
  /** Tavily credits used in the current UTC day. Missing reads as zero. */
  tavilyCreditsToday?: number;
  /** UTC month key captured when this amount was reserved. */
  month?: string;
  /** UTC day key captured when this amount was reserved. */
  day?: string;
}

export interface SpendLimits {
  /** Lifetime model spend cap across all users. */
  usd: number;
  /** Lifetime Tavily credit cap. */
  tavilyCredits: number;
  /** UTC day Tavily credit cap. Omitted only by older callers; that means no daily cap. */
  tavilyCreditsToday?: number;
  /** UTC month, YYYY-MM. */
  month?: string;
  /** UTC day, YYYY-MM-DD. */
  day?: string;
}

export type SpendReason = "spend_limit" | "daily_credit" | "spend_unreadable";

export interface SpendReservation {
  ok: boolean;
  reason?: SpendReason;
}

export interface SpendLedger {
  read(): Promise<SpendSnapshot>;
  /** Add the cost in one store operation. Refuse without adding when the total would reach a limit. */
  reserve(entry: SpendSnapshot, limits: SpendLimits): Promise<SpendReservation>;
  /** Move a reservation from the estimate to the actual cost. A failed write closes later calls. */
  settle(reserved: SpendSnapshot, actual: SpendSnapshot): Promise<void>;
  /** Publish the closed flag so another isolate cannot reserve. */
  close(): Promise<void>;
}

export type SpendDecision = {
  open: boolean;
  usd: number;
  tavilyCredits: number;
  tavilyCreditsToday: number;
  reason?: SpendReason;
};

/**
 * Upper bounds for the required limit settings, not fallbacks.
 * A blank or invalid setting refuses live checks.
 */
export const DOCUMENTED_LIMITS = { usd: 13.5, tavilyCredits: 400 } as const;
/** Stand-in so a caller that omits the daily cap does not trip it inside Redis. */
const OPEN_DAILY_CAP = 1_000_000_000;

export const SPEND_RESERVE_LUA = `
if redis.call('GET', KEYS[4]) == '1' then return -1 end
local usd = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
local day = tonumber(redis.call('GET', KEYS[3]) or '0')
if usd == nil or total == nil or day == nil then return -1 end
local addUsd = tonumber(ARGV[1])
local addCredits = tonumber(ARGV[2])
local maxUsd = tonumber(ARGV[3])
local maxTotal = tonumber(ARGV[4])
local maxDay = tonumber(ARGV[5])
if addUsd == nil or addCredits == nil or maxUsd == nil or maxTotal == nil or maxDay == nil then return -1 end
if addUsd < 0 or addCredits < 0 or usd < 0 or total < 0 or day < 0 then return -1 end
if (usd + addUsd) >= maxUsd or (total + addCredits) >= maxTotal then return 0 end
if (day + addCredits) >= maxDay then return 2 end
if addUsd > 0 then redis.call('INCRBYFLOAT', KEYS[1], addUsd) end
if addCredits > 0 then
  redis.call('INCRBY', KEYS[2], addCredits)
  redis.call('INCRBY', KEYS[3], addCredits)
end
return 1
`.trim();

/** Lifetime keys. They carry no date, so the caps never reopen. `spend:usd` is the key earlier releases used. */
const USD_KEY = "spend:usd";
const TAVILY_KEY = "spend:tavily:total";
const MIGRATED_KEY = "spend:migrated:lifetime";

/**
 * One time, in one step: fold the older monthly Tavily counters, and any monthly USD keys a
 * preview wrote, into the lifetime keys, so a deploy cannot reopen a spent budget.
 * KEYS: marker, usd, tavily total, then N monthly usd keys, then N monthly Tavily keys.
 */
export const SPEND_MIGRATE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
local n = tonumber(ARGV[1])
local usd = 0
local credits = 0
for i = 1, n do
  local u = tonumber(redis.call('GET', KEYS[3 + i]) or '0')
  local c = tonumber(redis.call('GET', KEYS[3 + n + i]) or '0')
  if u == nil or c == nil or u < 0 or c < 0 then return -1 end
  usd = usd + u
  credits = credits + c
end
if usd > 0 then redis.call('INCRBYFLOAT', KEYS[2], usd) end
if credits > 0 then redis.call('INCRBY', KEYS[3], credits) end
redis.call('SET', KEYS[1], '1')
return 1
`.trim();

/** Every UTC month from the first release month through the given one. */
export function legacyMonths(now = new Date()): string[] {
  const months: string[] = [];
  const end = now.getUTCFullYear() * 12 + now.getUTCMonth();
  for (let m = 2026 * 12; m <= end; m += 1) months.push(`${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`);
  return months;
}

/** UTC month and day. The day keys the optional daily Tavily cap; the lifetime keys ignore both. */
export function creditWindow(now = new Date()): { month: string; day: string } {
  const iso = now.toISOString();
  return { month: iso.slice(0, 7), day: iso.slice(0, 10) };
}

/** The window stamped at reserve time. A later clock must not move the adjustment. */
function reservedWindow(reserved: SpendSnapshot): { month: string; day: string } {
  if (reserved.month && /^\d{4}-\d{2}$/.test(reserved.month) && reserved.day && /^\d{4}-\d{2}-\d{2}$/.test(reserved.day)) {
    return { month: reserved.month, day: reserved.day };
  }
  return creditWindow();
}

export function spendLimits(env: NodeJS.ProcessEnv = runtimeEnv(), now = new Date()): SpendLimits {
  const window = creditWindow(now);
  return {
    usd: requireLimit(env.SPEND_HARD_LIMIT_USD, false, DOCUMENTED_LIMITS.usd),
    tavilyCredits: requireLimit(env.TAVILY_CREDIT_HARD_LIMIT, true, DOCUMENTED_LIMITS.tavilyCredits),
    // No daily Tavily cap unless one is set; the lifetime cap is the hard stop.
    ...(env.TAVILY_DAILY_CREDIT_LIMIT?.trim() ? { tavilyCreditsToday: requireLimit(env.TAVILY_DAILY_CREDIT_LIMIT, true, DOCUMENTED_LIMITS.tavilyCredits) } : {}),
    month: window.month,
    day: window.day,
  };
}

export class SpendConfigError extends Error {
  constructor() {
    super("spend_limit_config");
    this.name = "SpendConfigError";
  }
}

/** A required cap, never above the documented maximum. Blank, invalid, negative or higher throws, and live checks are refused. */
function requireLimit(raw: string | undefined, whole: boolean, ceiling: number): number {
  if (raw == null || raw.trim() === "") throw new SpendConfigError();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > ceiling || (whole && !Number.isSafeInteger(n))) throw new SpendConfigError();
  return n;
}

/** A tariff must be explicitly listed before a model can be dispatched. */
export function modelPrice(model: string): [number, number] {
  if (!Object.hasOwn(TOKEN_PRICES, model)) throw new Error("model_unpriced");
  return TOKEN_PRICES[model];
}
export function nebiusCallUsd(model: string, tokens: { in: number; out: number }): number {
  const price = modelPrice(model);
  const input = Number.isFinite(tokens.in) && tokens.in > 0 ? tokens.in : 0;
  const output = Number.isFinite(tokens.out) && tokens.out > 0 ? tokens.out : 0;
  return (input / 1_000_000) * price[0] + (output / 1_000_000) * price[1];
}

/** Prompts larger than this are refused before any reserve or call. */
export const MAX_PROMPT_TOKENS = 32_000;
/** Completion tokens one call may ask for. Larger requests are clamped before the reserve. */
export const MAX_COMPLETION_TOKENS = 1_500;
/** Chat template tokens around the system and user messages and the response format. */
const MESSAGE_FRAMING_TOKENS = 64;

/**
 * A token is at least one byte, so the UTF-8 length bounds the text from above. An image adds its
 * bounded ceiling; an image outside the bounds makes the prompt unbounded, so the call is refused.
 */
export function promptTokenBound(request: { model?: string; system: string; user: string; imageDataUrl?: string }): number {
  const image = request.imageDataUrl ? imageTokenBound(request.imageDataUrl, request.model ?? "") : 0;
  if (image == null) return Number.POSITIVE_INFINITY;
  return Buffer.byteLength(request.system, "utf8") + Buffer.byteLength(request.user, "utf8") + MESSAGE_FRAMING_TOKENS + image;
}

/** max_tokens as sent: a whole number from 1 to MAX_COMPLETION_TOKENS. */
export function clampCompletionTokens(maxTokens: number): number {
  return Number.isSafeInteger(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, MAX_COMPLETION_TOKENS) : MAX_COMPLETION_TOKENS;
}

/** Upper bound reserved before the token count comes back: the whole prompt plus max_tokens, at the selected model's price. */
export function nebiusReserveUsd(model: string, maxTokens: number, promptTokens: number): number {
  const out = clampCompletionTokens(maxTokens);
  const input = Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : MAX_PROMPT_TOKENS;
  const [inPrice, outPrice] = modelPrice(model);
  return (input / 1_000_000) * inPrice + (out / 1_000_000) * outPrice;
}

/**
 * A missing or negative credit count is not a small default.
 * Charge the hard-limit upper bound and treat the reading as an error.
 */
export function resolveCredits(value: number, upperBound: number): { credits: number; invalid: boolean } {
  if (!Number.isSafeInteger(value) || value < 0) {
    const bound = Number.isFinite(upperBound) && upperBound > 0 ? upperBound : 0;
    return { credits: bound, invalid: true };
  }
  return { credits: value, invalid: false };
}

/** Same decision the reserve script makes, so tests can describe the boundary. */
export function decideSpendReserve(
  current: SpendSnapshot,
  add: SpendSnapshot,
  limits: SpendLimits,
): SpendReservation {
  const today = current.tavilyCreditsToday ?? 0;
  if (!Number.isFinite(current.usd) || !Number.isFinite(current.tavilyCredits) || !Number.isFinite(today)) {
    return { ok: false, reason: "spend_unreadable" };
  }
  if (current.usd < 0 || current.tavilyCredits < 0 || today < 0) return { ok: false, reason: "spend_unreadable" };
  if (!Number.isFinite(add.usd) || !Number.isFinite(add.tavilyCredits) || add.usd < 0 || add.tavilyCredits < 0) {
    return { ok: false, reason: "spend_unreadable" };
  }
  if (limits.tavilyCreditsToday != null && (!Number.isFinite(limits.tavilyCreditsToday) || limits.tavilyCreditsToday < 0)) {
    return { ok: false, reason: "spend_unreadable" };
  }
  if (current.usd + add.usd >= limits.usd || current.tavilyCredits + add.tavilyCredits >= limits.tavilyCredits) {
    return { ok: false, reason: "spend_limit" };
  }
  if (limits.tavilyCreditsToday != null && today + add.tavilyCredits >= limits.tavilyCreditsToday) {
    return { ok: false, reason: "daily_credit" };
  }
  return { ok: true };
}

export function formatSpend(snapshot: SpendSnapshot, limits: SpendLimits): { usd: string; credits: string; daily: string; paused: boolean } {
  const today = snapshot.tavilyCreditsToday ?? 0;
  const dailyCap = limits.tavilyCreditsToday;
  const paused = snapshot.usd >= limits.usd
    || snapshot.tavilyCredits >= limits.tavilyCredits
    || (dailyCap != null && today >= dailyCap);
  return {
    usd: `$${snapshot.usd.toFixed(4)} of $${limits.usd.toFixed(2)}`,
    daily: dailyCap == null ? `${today} Tavily credits today, no daily cap` : `${today} of ${dailyCap} Tavily credits today`,
    credits: `${snapshot.tavilyCredits} of ${limits.tavilyCredits} Tavily credits in total`,
    paused,
  };
}

/** One public line for every pause. The owner desk shows the reason code next to it. */
export const SPEND_PAUSE_COPY = "Live checks are temporarily unavailable. Showing a recorded case.";

function unread(): SpendDecision {
  return { open: false, usd: 0, tavilyCredits: 0, tavilyCreditsToday: 0, reason: "spend_unreadable" };
}

export async function evaluateSpend(
  ledger: SpendLedger = getSpendLedger(),
  limits?: SpendLimits,
): Promise<SpendDecision> {
  let resolved: SpendLimits;
  try {
    resolved = limits ?? spendLimits();
  } catch {
    markSpendBroken();
    return unread();
  }
  if (spendLedgerBroken()) return unread();
  try {
    const snapshot = await ledger.read();
    const today = snapshot.tavilyCreditsToday ?? 0;
    if (!Number.isFinite(snapshot.usd) || !Number.isFinite(snapshot.tavilyCredits) || !Number.isFinite(today) || snapshot.usd < 0 || snapshot.tavilyCredits < 0 || today < 0) {
      markSpendBroken();
      return unread();
    }
    if (resolved.tavilyCreditsToday != null && (!Number.isFinite(resolved.tavilyCreditsToday) || resolved.tavilyCreditsToday < 0)) {
      markSpendBroken();
      return unread();
    }
    if (snapshot.usd >= resolved.usd || snapshot.tavilyCredits >= resolved.tavilyCredits) {
      return { open: false, usd: snapshot.usd, tavilyCredits: snapshot.tavilyCredits, tavilyCreditsToday: today, reason: "spend_limit" };
    }
    if (resolved.tavilyCreditsToday != null && today >= resolved.tavilyCreditsToday) {
      return { open: false, usd: snapshot.usd, tavilyCredits: snapshot.tavilyCredits, tavilyCreditsToday: today, reason: "daily_credit" };
    }
    return { open: true, usd: snapshot.usd, tavilyCredits: snapshot.tavilyCredits, tavilyCreditsToday: today };
  } catch {
    markSpendBroken();
    return unread();
  }
}

/** No Redis. Reads and reserves fail closed. This does not keep a balance. */
export class UnavailableSpendLedger implements SpendLedger {
  async read(): Promise<SpendSnapshot> {
    throw new Error("spend_store");
  }

  async reserve(): Promise<SpendReservation> {
    return { ok: false, reason: "spend_unreadable" };
  }

  async settle(): Promise<void> {
    markSpendBroken();
    throw new Error("spend_store");
  }

  async close(): Promise<void> {
    markSpendBroken();
  }
}

export class UpstashSpendLedger implements SpendLedger {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private migrated = false;

  /** Runs the one-time fold before the first read or reserve. A failure closes the ledger. */
  private async migrate(): Promise<void> {
    if (this.migrated) return;
    const months = legacyMonths();
    const result = await this.command<number>([
      "EVAL",
      SPEND_MIGRATE_LUA,
      3 + months.length * 2,
      MIGRATED_KEY,
      USD_KEY,
      TAVILY_KEY,
      ...months.map((month) => `spend:usd:${month}`),
      ...months.map((month) => `spend:tavily:${month}`),
      months.length,
    ]);
    if (result !== 0 && result !== 1) throw new Error("spend_store");
    this.migrated = true;
  }

  async read(): Promise<SpendSnapshot> {
    if (spendLedgerBroken()) throw new Error("spend_store");
    await this.migrate();
    if (await this.closedFlag()) {
      markSpendBroken();
      throw new Error("spend_store");
    }
    const window = creditWindow();
    const usdRaw = await this.command<string | null>(["GET", USD_KEY]);
    const monthRaw = await this.command<string | null>(["GET", TAVILY_KEY]);
    const dayRaw = await this.command<string | null>(["GET", `spend:tavily:${window.day}`]);
    return {
      usd: parseStoredUsd(usdRaw),
      tavilyCredits: parseStoredCredits(monthRaw),
      tavilyCreditsToday: parseStoredCredits(dayRaw),
    };
  }

  async reserve(entry: SpendSnapshot, limits: SpendLimits): Promise<SpendReservation> {
    if (spendLedgerBroken()) return { ok: false, reason: "spend_unreadable" };
    try {
      await this.migrate();
      if (await this.closedFlag()) {
        markSpendBroken();
        return { ok: false, reason: "spend_unreadable" };
      }
    } catch {
      markSpendBroken();
      return { ok: false, reason: "spend_unreadable" };
    }
    const usd = finiteUsd(entry.usd);
    const credits = finiteWhole(entry.tavilyCredits);
    if (usd == null || credits == null) {
      markSpendBroken();
      return { ok: false, reason: "spend_unreadable" };
    }
    const window = {
      month: limits.month || creditWindow().month,
      day: limits.day || creditWindow().day,
    };
    entry.month = window.month;
    entry.day = window.day;
    const maxDay = limits.tavilyCreditsToday == null ? OPEN_DAILY_CAP : limits.tavilyCreditsToday;
    try {
      const result = await this.command<number>([
        "EVAL",
        SPEND_RESERVE_LUA,
        4,
        USD_KEY,
        TAVILY_KEY,
        `spend:tavily:${window.day}`,
        "spend:closed",
        usd,
        credits,
        limits.usd,
        limits.tavilyCredits,
        maxDay,
      ]);
      if (result === 1) return { ok: true };
      if (result === 0) return { ok: false, reason: "spend_limit" };
      if (result === 2) return { ok: false, reason: "daily_credit" };
      markSpendBroken();
      return { ok: false, reason: "spend_unreadable" };
    } catch {
      markSpendBroken();
      return { ok: false, reason: "spend_unreadable" };
    }
  }

  async settle(reserved: SpendSnapshot, actual: SpendSnapshot): Promise<void> {
    if (spendLedgerBroken()) throw new Error("spend_store");
    const usd = finiteUsd(actual.usd);
    const credits = finiteWhole(actual.tavilyCredits);
    const heldUsd = finiteUsd(reserved.usd);
    const heldCredits = finiteWhole(reserved.tavilyCredits);
    if (usd == null || credits == null || heldUsd == null || heldCredits == null) {
      await this.closeInStore();
      throw new Error("spend_store");
    }
    // Never settle above the reservation: the reserve kept the total under the cap.
    const usdDelta = Math.min(usd, heldUsd) - heldUsd;
    const creditDelta = Math.min(credits, heldCredits) - heldCredits;
    const window = reservedWindow(reserved);
    try {
      if (usdDelta !== 0) await this.command(["INCRBYFLOAT", USD_KEY, usdDelta]);
      if (creditDelta !== 0) {
        await this.command(["INCRBY", TAVILY_KEY, creditDelta]);
        await this.command(["INCRBY", `spend:tavily:${window.day}`, creditDelta]);
      }
    } catch (error) {
      await this.closeInStore();
      throw error;
    }
  }

  private async closedFlag(): Promise<boolean> {
    const value = await this.command<string | null>(["GET", "spend:closed"]);
    return value === "1";
  }

  /** Other processes read this key. A failed settle must not stay local to this one. */
  async close(): Promise<void> {
    await this.closeInStore();
  }

  private async closeInStore(): Promise<void> {
    markSpendBroken();
    try {
      await this.command(["SET", "spend:closed", "1"]);
    } catch {
      // The process flag is already set when the store itself cannot take the write.
    }
  }

  private async command<T>(args: unknown[]): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    } catch {
      throw new Error("spend_store");
    }
    if (!res.ok) throw new Error("spend_store");
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error) throw new Error("spend_store");
    return json.result as T;
  }
}

type SpendSlot = { key: string; ledger: SpendLedger | null; override: SpendLedger | null };

const spendGlobal = globalThis as typeof globalThis & {
  __scamScoutSpend?: SpendSlot;
  __scamScoutSpendBroken?: boolean;
};

function slot(): SpendSlot {
  if (!spendGlobal.__scamScoutSpend) spendGlobal.__scamScoutSpend = { key: "", ledger: null, override: null };
  return spendGlobal.__scamScoutSpend;
}

export function spendLedgerBroken(): boolean {
  return spendGlobal.__scamScoutSpendBroken === true;
}

export function markSpendBroken(): void {
  spendGlobal.__scamScoutSpendBroken = true;
}

export function resetSpendState(): void {
  const current = slot();
  current.key = "";
  current.ledger = null;
  current.override = null;
  spendGlobal.__scamScoutSpendBroken = false;
}

export function getSpendLedger(env: NodeJS.ProcessEnv = runtimeEnv()): SpendLedger {
  const current = slot();
  if (current.override) return current.override;
  const url = env["UPSTASH_REDIS_REST_URL"] ?? "";
  const token = env["UPSTASH_REDIS_REST_TOKEN"] ?? "";
  const key = url && token ? `upstash:${url}` : "unavailable";
  if (current.ledger && current.key === key) return current.ledger;
  current.key = key;
  current.ledger = key === "unavailable" ? new UnavailableSpendLedger() : new UpstashSpendLedger(url, token);
  return current.ledger;
}

export function setSpendLedger(ledger: SpendLedger | null): void {
  slot().override = ledger;
}

function finiteUsd(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function finiteWhole(value: number): number | null {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function parseStoredUsd(raw: string | null): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("spend_store");
  return n;
}

function parseStoredCredits(raw: string | null): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error("spend_store");
  return n;
}
