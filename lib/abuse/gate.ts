import { createHash } from "node:crypto";
import type { UsageStore } from "@/lib/abuse/store";
import { OWNER_DAILY_LIVE_CAP_DEFAULT } from "@/lib/safety/live-access";
import { GLOBAL_LIVE_DAILY_CAP_DEFAULT } from "@/lib/config";

export interface QuotaLimits {
  accountAllowance: number;
  ipDailyCap: number;
  deviceDailyCap: number;
  ratePerHour: number;
  dailyCreditCap: number;
  creditsPerLiveCase: number;
  /** Hosted live checks per UTC day across all users. 0 or unset means no daily cap. */
  globalDailyCap?: number;
}

export interface GateInput {
  userId?: string;
  email?: string;
  human: boolean;
  keysConfigured: boolean;
  /** Caller supplied both research and model keys. Skips the shared spend cap and the account allowance. */
  byok?: boolean;
  /**
   * Owner live checks. The gate is closed unless both are true.
   * Pass publicQuota to use the account allowance instead.
   */
  liveModeEnabled?: boolean;
  allowlisted?: boolean;
  ownerDailyCap?: number;
  /** Skip the lifetime account allowance. The route sets this for an allowlisted owner. */
  ownerDailyOnly?: boolean;
  /** Opt in to the account-allowance path. Omitted, the owner gate is closed. */
  publicQuota?: boolean;
  /** The shared judge account: no owner day cap, but the network, device and hourly limits apply. */
  judge?: boolean;
  ip: string;
  deviceId: string;
  userAgent: string;
  cookieUsed?: number;
  now?: Date;
  store: UsageStore;
  limits: QuotaLimits;
}

export interface GateDecision {
  ok: boolean;
  status: number;
  mode: "live" | "replay" | "denied";
  error?: string;
  reason?: string;
  retryAfter?: number;
  remaining?: number;
  used?: number;
  allowance?: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export async function authorizeLive(input: GateInput): Promise<GateDecision> {
  const now = input.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const ownerGate = input.publicQuota !== true;
  let ownerKey: string | null = null;
  if (ownerGate) {
    if (input.liveModeEnabled !== true || input.allowlisted !== true) {
      return { ok: true, status: 200, mode: "replay", reason: "live_invite_only" };
    }
  }
  if (ownerGate && !input.judge) {
    const cap = input.ownerDailyCap != null && input.ownerDailyCap >= 1 ? Math.floor(input.ownerDailyCap) : OWNER_DAILY_LIVE_CAP_DEFAULT;
    ownerKey = `owner:${(input.email || input.userId || "owner").toLowerCase()}:${day}`;
    const hold = await input.store.reserveCount(ownerKey, DAY, cap);
    if (!hold.ok) return { ok: true, status: 200, mode: "replay", reason: "owner_daily_cap" };
  }
  let globalKey: string | null = null;
  const releaseOwner = async () => {
    if (ownerKey) await input.store.releaseCount(ownerKey);
    if (globalKey) await input.store.releaseCount(globalKey);
  };

  if (!input.userId) {
    await releaseOwner();
    return { ok: false, status: 401, mode: "denied", error: "Sign in to run a live check. Recorded cases stay open." };
  }
  if (!input.human) {
    await releaseOwner();
    return { ok: false, status: 403, mode: "denied", error: "The live check could not start. Try again." };
  }
  if (input.byok) {
    // Own keys skip the shared pool and the account allowance, but not the network, device and hourly throttles.
    const throttled = await holdThrottles(input, now, day, releaseOwner);
    if (throttled) return throttled;
    return { ok: true, status: 200, mode: "live", reason: "byok" };
  }
  if (!input.keysConfigured) {
    await releaseOwner();
    return { ok: true, status: 200, mode: "replay", reason: "providers_unconfigured" };
  }

  // When set, every hosted check, the owner's included, counts against the shared day.
  const globalCap = input.limits.globalDailyCap ?? GLOBAL_LIVE_DAILY_CAP_DEFAULT;
  if (globalCap > 0) {
    const sharedDayKey = `live-all:${day}`;
    const shared = await input.store.reserveCount(sharedDayKey, DAY, globalCap);
    if (!shared.ok) {
      await releaseOwner();
      return { ok: true, status: 200, mode: "replay", reason: "global_daily_cap" };
    }
    globalKey = sharedDayKey;
  }

  // An allowlisted owner is held only on the owner day. Network, device, hour, account, and the shared pool do not apply.
  // The judge has no owner day, so it falls through to the network, device and hourly limits below.
  if (ownerKey) {
    return { ok: true, status: 200, mode: "live" };
  }

  // The judge has no daily pool; the lifetime spend ledger bounds its cost.
  const pooled = !input.judge;
  const releasePool = async () => {
    if (pooled) await input.store.releaseCredits(day, input.limits.creditsPerLiveCase);
  };
  if (pooled) {
    const creditHold = await input.store.reserveCredits(day, input.limits.creditsPerLiveCase, input.limits.dailyCreditCap);
    if (!creditHold.ok) {
      await releaseOwner();
      return { ok: true, status: 200, mode: "replay", reason: "daily_cap" };
    }
  }

  let used: number | undefined;
  let allowance: number | undefined;
  if (!input.ownerDailyOnly) {
    const accountHold = await input.store.reserveAccount(input.userId, input.limits.accountAllowance, input.cookieUsed ?? 0);
    allowance = input.limits.accountAllowance + accountHold.record.bonus;
    if (!accountHold.ok) {
      await releasePool();
      await releaseOwner();
      return {
        ok: false,
        status: 402,
        mode: "denied",
        reason: "account_allowance",
        error: "Live checks are temporarily unavailable. Choose a recorded example.",
        used: accountHold.record.used,
        allowance,
      };
    }
    used = accountHold.record.used;
  }

  const throttled = await holdThrottles(input, now, day, async () => {
    await releasePool();
    if (!input.ownerDailyOnly) await input.store.releaseAccount(input.userId!);
    await releaseOwner();
  });
  if (throttled) return throttled;

  return {
    ok: true,
    status: 200,
    mode: "live",
    ...(used !== undefined && allowance !== undefined
      ? { used, allowance, remaining: Math.max(0, allowance - used) }
      : {}),
  };
}

/** Network, device and hourly throttles. Returns a denial (after calling release) or null when all are held. */
async function holdThrottles(input: GateInput, now: Date, day: string, release: () => Promise<void>): Promise<GateDecision | null> {
  const ipDayKey = `ip:${input.ip}:${day}`;
  const deviceKey = `device:${input.deviceId}:${day}`;
  const ipuaKey = `ipua:${fingerprint(input.ip, input.userAgent)}:${day}`;
  const hourKey = `hour:${input.ip}:${now.toISOString().slice(0, 13)}`;
  const checks = [
    { key: ipDayKey, reason: "ip_daily", ttl: DAY, limit: input.limits.ipDailyCap, error: "Live checks are temporarily unavailable. Try again later.", retryAfter: secondsUntilDay(now) },
    { key: deviceKey, reason: "device_daily", ttl: DAY, limit: input.limits.deviceDailyCap, error: "Live checks are temporarily unavailable. Try again later.", retryAfter: secondsUntilDay(now) },
    { key: ipuaKey, reason: "ip_daily", ttl: DAY, limit: input.limits.ipDailyCap, error: "Live checks are temporarily unavailable. Try again later.", retryAfter: secondsUntilDay(now) },
    { key: hourKey, reason: "hourly", ttl: HOUR, limit: input.limits.ratePerHour, error: "Live checks are temporarily unavailable. Try again later.", retryAfter: 3600 },
  ];
  const held: string[] = [];
  for (const check of checks) {
    const reservation = await input.store.reserveCount(check.key, check.ttl, check.limit);
    if (!reservation.ok) {
      await Promise.all(held.map((key) => input.store.releaseCount(key)));
      await release();
      return { ok: false, status: 429, mode: "denied", reason: check.reason, error: check.error, retryAfter: check.retryAfter };
    }
    held.push(check.key);
  }

  return null;
}

export function parseInviteCodes(raw: string | undefined): Map<string, number> {
  const codes = new Map<string, number>();
  if (!raw) return codes;
  for (const part of raw.split(",")) {
    const [code, count] = part.split(":");
    const amount = Number(count);
    if (code?.trim() && Number.isFinite(amount) && amount > 0) codes.set(code.trim(), amount);
  }
  return codes;
}

/** Invite codes are short, so guesses are capped per account per day before any lookup. */
export const INVITE_TRIES_PER_DAY = 10;

export async function redeemCode(store: UsageStore, userId: string, code: string, catalog: Map<string, number>, allowanceBase: number) {
  const tries = await store.reserveCount(`invite-tries:${userId}`, 86_400_000, INVITE_TRIES_PER_DAY);
  if (!tries.ok) return { ok: false as const, error: "That code could not be applied." };
  const amount = catalog.get(code.trim());
  if (!amount) return { ok: false as const, error: "That code could not be applied." };
  const account = await store.getAccount(userId);
  if (account.codes.includes(code.trim())) return { ok: false as const, error: "That code could not be applied." };
  const next = await store.addBonus(userId, code.trim(), amount);
  const allowance = allowanceBase + next.bonus;
  return { ok: true as const, allowance, remaining: Math.max(0, allowance - next.used), added: amount };
}

function fingerprint(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 16);
}

function secondsUntilDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.round((next - now.getTime()) / 1000));
}
