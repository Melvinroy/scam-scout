import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { UsageStore } from "@/lib/abuse/store";
import { runtimeEnv } from "@/lib/config";

/** The one shared judge account. Its session carries this role instead of an allowlisted email. */
export const JUDGE_ROLE = "judge";
export const JUDGE_FAILS_PER_IP = 5;
/** Across all addresses, so spreading guesses over many IPs still locks the account. */
export const JUDGE_FAILS_TOTAL = 30;
const FAIL_WINDOW_MS = 15 * 60_000;
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export interface JudgeUser {
  id: string;
  name: string;
  role: typeof JUDGE_ROLE;
}

/**
 * Checks the judge login against JUDGE_USERNAME and the bcrypt JUDGE_PASSWORD_HASH.
 * Unset or malformed settings, a lockout, or an unreadable store all refuse.
 */
export async function verifyJudge(
  credentials: { username?: unknown; password?: unknown },
  ip: string,
  store: UsageStore,
  env: NodeJS.ProcessEnv = runtimeEnv(),
): Promise<JudgeUser | null> {
  const expectedName = env["JUDGE_USERNAME"]?.trim();
  const hash = env["JUDGE_PASSWORD_HASH"]?.trim();
  if (!expectedName || !hash || !BCRYPT_HASH.test(hash)) return null;
  const { username, password } = credentials;
  if (typeof username !== "string" || typeof password !== "string" || password.length > 256 || username.length > 128) return null;
  const ipKey = `judge-fail:${ip}`;
  const allKey = "judge-fail:all";
  try {
    // Every attempt takes a slot before bcrypt runs, so parallel guesses cannot slip past the limit.
    if (!(await store.reserveCount(ipKey, FAIL_WINDOW_MS, JUDGE_FAILS_PER_IP)).ok) return null;
    if (!(await store.reserveCount(allKey, FAIL_WINDOW_MS, JUDGE_FAILS_TOTAL)).ok) {
      await store.releaseCount(ipKey);
      return null;
    }
    const passwordOk = await bcrypt.compare(password, hash);
    if (!passwordOk || !sameText(username.trim(), expectedName)) return null;
    await store.releaseCount(ipKey);
    await store.releaseCount(allKey);
    return { id: JUDGE_ROLE, name: "Guest", role: JUDGE_ROLE };
  } catch {
    return null;
  }
}

function sameText(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}
