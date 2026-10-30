import { JUDGE_ROLE } from "@/lib/auth/judge";
import { runtimeEnv } from "@/lib/config";

/** Owner-only live checks. Names are read here; values stay in the host environment. */

const ON = new Set(["1", "true", "on", "yes"]);

/** Used when OWNER_DAILY_LIVE_CAP is unset, blank, or below 1. The gate uses the same fallback. */
export const OWNER_DAILY_LIVE_CAP_DEFAULT = 15;
/** Highest owner day cap a setting can ask for. */
export const OWNER_DAILY_LIVE_CAP_MAX = 50;

/** Allowlisted owners still hit the spend ledger. The usage gate does not waive it. */
export function ownerSubjectToSpendStop(enabled: boolean, allowlisted: boolean): boolean {
  return enabled && allowlisted;
}

export function liveModeEnabled(env: NodeJS.ProcessEnv = runtimeEnv()): boolean {
  return ON.has((env["LIVE_MODE_ENABLED"] ?? "").trim().toLowerCase());
}

export function allowlistEmails(env: NodeJS.ProcessEnv = runtimeEnv()): string[] {
  return (env["LIVE_ALLOWLIST_EMAILS"] ?? "")
    .split(/[,;\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.includes("@"));
}

export function ownerDailyLiveCap(env: NodeJS.ProcessEnv = runtimeEnv()): number {
  const raw = env["OWNER_DAILY_LIVE_CAP"];
  if (raw == null || raw.trim() === "") return OWNER_DAILY_LIVE_CAP_DEFAULT;
  const n = Number(raw);
  // A bad value tightens to one check a day rather than reopening the default.
  if (!Number.isSafeInteger(n) || n < 1) return 1;
  return Math.min(n, OWNER_DAILY_LIVE_CAP_MAX);
}

export function isAllowlistedEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = runtimeEnv()): boolean {
  if (!email) return false;
  return allowlistEmails(env).includes(email.trim().toLowerCase());
}

/** Live checks, not the captures desk. The desk stays available while the switch is off. */
export function isLiveOwner(email: string | null | undefined, env: NodeJS.ProcessEnv = runtimeEnv(), role?: string): boolean {
  return liveModeEnabled(env) && (role === JUDGE_ROLE || isAllowlistedEmail(email, env));
}

/** An allowlisted owner email or the signed-in judge account. Everyone else plays recordings. */
export function liveGateFields(email: string | null | undefined, env: NodeJS.ProcessEnv = runtimeEnv(), role?: string) {
  const enabled = liveModeEnabled(env);
  const allowlisted = role === JUDGE_ROLE || isAllowlistedEmail(email, env);
  return {
    email: email ?? undefined,
    liveModeEnabled: enabled,
    allowlisted,
    ownerDailyCap: ownerDailyLiveCap(env),
    ownerDailyOnly: enabled && allowlisted,
    judge: role === JUDGE_ROLE,
  };
}
