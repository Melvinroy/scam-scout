import { isWarning } from "@/lib/agent/detect";
import {
  countsAsRegulatorWarning,
  exactInTitleOrUrl,
  isAlertListing,
  isBrandPressRelease,
  isGovNotice,
  isPdf,
  institutionSlugMatches,
  isRegisterPage,
  isRegulatorNotice,
  isStorageArtefact,
  listsTypedDomain,
  regulatorPage,
} from "@/lib/agent/surface";
import type { NormalizedEntity, SearchHit } from "@/lib/types";

/** Same page with or without a trailing slash, a hash, or a www host. */
export function canonicalUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${host}${path}${parsed.search}`;
  } catch {
    return trimmed.toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

/**
 * Exact warning-list matches lead. Press releases, NSM filings, and other
 * firms' warning pages are dropped. The same URL is kept once.
 */
export function rankSearchHits(hits: SearchHit[], entity: NormalizedEntity, replay = false): SearchHit[] {
  const ranked = hits
    .map((hit, index) => ({ hit, index, score: scoreHit(hit, entity, replay) }))
    .filter((item) => keepHit(item.hit, entity, replay));
  const best = new Map<string, { hit: SearchHit; index: number; score: number }>();
  for (const item of ranked) {
    const key = canonicalUrl(item.hit.url);
    const previous = best.get(key);
    if (!previous || item.score > previous.score || (item.score === previous.score && item.index < previous.index)) {
      best.set(key, item);
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.hit);
}

function keepHit(hit: SearchHit, entity: NormalizedEntity, replay = false): boolean {
  if (isStorageArtefact(hit.url, replay)) return false;
  if (isPdf(hit.url) && !isRegisterPage(hit.url, replay)) return false;
  if (isGovNotice(hit.url, replay)) return countsAsRegulatorWarning(hit, entity, replay);
  if (isRegisterPage(hit.url, replay)) {
    return listsTypedDomain(`${hit.title}\n${hit.content}`, entity, true) || institutionSlugMatches(hit.url, entity, replay);
  }
  if (isAlertListing(hit.url)) return countsAsRegulatorWarning(hit, entity, replay);
  if (regulatorPage(hit.url, replay) && isRegulatorNotice(hit.url, hit.title)) return exactInTitleOrUrl(hit.title, hit.url, entity);
  if (isBrandPressRelease(hit.url)) return false;
  return exactInTitleOrUrl(hit.title, hit.url, entity);
}

function scoreHit(hit: SearchHit, entity: NormalizedEntity, replay = false): number {
  const titled = exactInTitleOrUrl(hit.title, hit.url, entity);
  const blob = `${hit.title}\n${hit.url}\n${hit.content}`;
  const warning = countsAsRegulatorWarning(hit, entity, replay);
  let score = 0;
  if (warning) score += 1000;
  else if (titled || (isRegisterPage(hit.url, replay) && listsTypedDomain(blob, entity, true))) score += 1000;
  if (/\/news\/warnings?\//i.test(hit.url)) score += 40;
  if (isWarning(blob)) score += 20;
  if (/scam|fraud|protect yourself|how to spot/i.test(blob) && !titled && !warning) score -= 10;
  return score;
}
