import type { ActionName } from "@/lib/types";

export interface PolicyView {
  domain?: string;
  name: string;
  phone?: string;
  ownSiteText: string;
  licensed: boolean;
  done: Set<ActionName>;
  followUps: number;
}

export interface PlannedAction {
  action: ActionName;
  reason: string;
  query: string;
  expected_signal: string;
}

const LICENCE_CLAIM = /licen[cs]ed by|regulated by|authorised by|authorized by/i;
const FINGERPRINT = /chatwave|signalcove|whatsapp|telegram|@[a-z0-9.-]+\.[a-z]{2,}/i;

export function nextFollowUp(view: PolicyView): PlannedAction | null {
  if (view.followUps >= 2) return null;
  if (view.domain && LICENCE_CLAIM.test(view.ownSiteText) && !view.licensed && !view.done.has("verify_registration")) {
    return {
      action: "verify_registration",
      reason: "The site claims a licence, so the next check is the official register.",
      query: `${view.name} licence register ${view.domain}`,
      expected_signal: "S4|M1",
    };
  }
  if (view.domain && FINGERPRINT.test(view.ownSiteText) && !view.done.has("find_copycats")) {
    const snippet = view.ownSiteText.replace(/\s+/g, " ").slice(0, 80);
    return {
      action: "find_copycats",
      reason: "A contact fingerprint from the site is distinctive enough to search for copies.",
      query: `copycat "${snippet}"`,
      expected_signal: "S5",
    };
  }
  return null;
}

export type StopCode = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";

export function stopReason(input: {
  hardTrigger: boolean;
  floorComplete: boolean;
  score: number;
  highSeveritySources: number;
  strongMitigation: boolean;
  noveltyStreak: number;
  budgetExhausted: boolean;
  degraded: boolean;
  followUpPending: boolean;
}): { code: StopCode; reason: string } | null {
  if (input.degraded) return { code: "S7", reason: "A tool failed twice, so the case is closing in degraded mode." };
  if (input.budgetExhausted) return { code: "S6", reason: "The case budget is spent." };
  if (input.followUpPending) return null;
  if (input.hardTrigger && input.floorComplete) {
    return { code: "S1", reason: "A hard trigger is confirmed and the coverage floor is complete." };
  }
  if (input.score >= 60 && input.highSeveritySources >= 2) {
    return { code: "S2", reason: "The score is at least 60 with high-severity signals from two or more sources." };
  }
  if (input.score <= 15 && input.strongMitigation) {
    return { code: "S3", reason: "The score is low and a strong mitigating source is on file." };
  }
  if (input.noveltyStreak >= 2) return { code: "S4", reason: "Two steps in a row added no new signals." };
  return null;
}
