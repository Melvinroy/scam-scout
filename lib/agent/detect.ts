import { getDomain } from "tldts";
import { mentionsEntity, phoneDigits } from "@/lib/agent/normalize";
import { isOfficialBrand, lookalikeOf } from "@/lib/agent/lookalike";
import { countsAsRegulatorWarning, exactInTitleOrUrl, exactInputIn, institutionContactHosts, institutionSlugMatches, isBrandPressRelease, isGovNotice, isInstitutionProfile, isPdf, isRegisterPage, isRegulatorHost, isStorageArtefact, listsTypedDomain, normalizeSurface, pickInstitutionProfile, REGULATOR_HOSTS } from "@/lib/agent/surface";
import type { SignalDraft } from "@/lib/scoring/scorer";
import type { NormalizedEntity, SourceType } from "@/lib/types";
import type { VisionResult } from "@/lib/providers/types";

export interface Observation {
  action: string;
  url: string;
  title: string;
  text: string;
  sourceDomain: string;
  sourceType: SourceType;
  evidenceId: string;
}

export interface DetectContext {
  entity: NormalizedEntity;
  observations: Observation[];
  mapUrls: string[];
  ownSiteText: string;
  ageDays: number | null;
  copycats: string[];
  vision: VisionResult | null;
  registrationChecked: boolean;
}

export { REGULATOR_HOSTS, isRegulatorHost };

const WARNING = /\/warnings?(?:\/|$|\b)|investor alert|warning list|\bred list\b|public alert|not regulated|not registered|not authori[sz]ed|unauthori[sz]ed|clone firm|\bclone of\b|\bclone\b|scam alert|do not deal|blacklist|\bfraudulent\b/i;
const REGULATOR_NAME = /financial conduct office|\bfco\b|harbour monetary authority|\bhma\b|securities oversight board|\bsob\b|\bisocb\b|\bdtsb\b|harbour post|securities and exchange commission|\bsec\b|financial conduct authority|\bfca\b|monetary authority of singapore|\bmas\b|\basic\b|commodity futures trading commission|\bcftc\b|\biosco\b|hongkong post/i;
const LICENCE = /licen[cs]ed|authori[sz]ed|major payment institution/i;
/** A directory profile states a status even when the contact URL is below the quote window. */
const REGISTER_STATUS = /licence type|local bank|designated payment system settlement|recognised market operator|licensed trust company|approved cis trustee/i;
const NEGATION = /no (matching|records|entry|result)|not (licensed|regulated|authorised|authorized)|not found|is not licensed/i;
const COMPLAINT = /scam|fraud|cannot withdraw|can't withdraw|never arrived|nothing arrived|took my money|locked (my|the) account|complaint|disappeared/i;
const PRESSURE = /personal account|gift card|crypto wallet|wire to this account|act now|only today/i;
const RETURNS = /guaranteed\s+\d+\s*%|guaranteed return|risk[- ]free|\d+(\.\d+)?%\s+(a|per)\s+week/i;
const INJECTION = /ignore previous instructions|ignore all previous|system prompt|you are now/i;
const ADDRESS = /\d+\s+\w+\s+(road|rd|street|st|avenue|ave|drive|lane|boulevard|way)\b|\baddress\b/i;
const MESSENGER = /chatwave|signalcove|whatsapp|telegram/i;
const FREE_EMAIL = /@(gmail|yahoo|hotmail|outlook|proton)\./i;
const WORKABLE_REFUND = /refunds are issued|money back|refund within|returns are accepted/i;
const REFUND_DENIAL = /no refund|without a refund|refunds are not|no refund policy/i;
const POSITIVE = /review|reliable|arrived|established|since 20/i;
const UEN = /\bUEN\s*[0-9]{8,10}[A-Z]\b|\bcompany number\s*\d{6,}\b/i;

export function sourceDomain(url: string): string {
  try {
    const host = new URL(url).hostname;
    return (getDomain(host) || host).toLowerCase();
  } catch {
    return "";
  }
}

export function isWarning(text: string): boolean {
  return WARNING.test(text);
}

/** One list for detection and for the regulator search filter. */
export function regulatorSearchDomains(): readonly string[] {
  return REGULATOR_HOSTS;
}

export function classifySource(domain: string, action: string): SourceType {
  if (action === "rdap") return "rdap";
  if (action === "screenshot") return "vision";
  if (isRegulatorHost(domain)) return "regulator";
  if (action === "search_news") return "news";
  if (action === "extract_pages" || action === "crawl_site") return "own_site";
  if (/forum|victim|reddit|complaint/i.test(domain)) return "forum";
  if (/review|guide/i.test(domain)) return "review";
  return "unknown";
}

/** Names as typed, plus the same name without a leading article, so "The London Investment Bank" matches the FCA title. */
function entityNames(entity: NormalizedEntity): string[] {
  const names = entity.canonical.names.map((name) => name.trim()).filter((name) => name.length > 3);
  const bare = names
    .map((name) => name.replace(/^(the|a|an)\s+/i, "").trim())
    .filter((name) => name.length > 3);
  const raw = entity.raw.trim();
  const extra = raw.length > 3 ? [raw] : [];
  return [...new Set([...names, ...bare, ...extra].map((name) => normalizeSurface(name)))];
}

export function exactHit(text: string, entity: NormalizedEntity): boolean {
  if (entity.canonical.domain) return exactInputIn(text, entity);
  const hay = normalizeSurface(text);
  return entityNames(entity).some((name) => name.length > 3 && hay.includes(name));
}

function observationText(item: Observation): string {
  return `${item.title}\n${item.url}\n${item.text}`;
}


function fuzzyToken(text: string, entity: NormalizedEntity): boolean {
  if (entity.canonical.domain) return false;
  const hay = text.toLowerCase();
  const tokens = entity.canonical.names.flatMap((name) => name.toLowerCase().split(/\s+/)).filter((token) => token.length >= 6);
  return tokens.some((token) => hay.includes(token));
}

function licenceRegister(item: Observation, entity: NormalizedEntity, picked: string | null): boolean {
  if (!isRegisterPage(item.url) || isStorageArtefact(item.url)) return false;
  if (isPdf(item.url) && !/\/fid\/institution\//i.test(item.url)) return false;
  const blob = observationText(item);
  if (NEGATION.test(blob) || isWarning(blob)) return false;
  const listed = listsTypedDomain(blob, entity, true);
  const contacts = institutionContactHosts(blob);
  if (contacts.length > 0 && !listed) return false;
  if (isInstitutionProfile(item.url)) {
    if (!picked || item.url !== picked) return false;
    return listed || (institutionSlugMatches(item.url, entity) && REGISTER_STATUS.test(blob));
  }
  if (!listed) return false;
  return LICENCE.test(item.text);
}

export function detectSignals(ctx: DetectContext): SignalDraft[] {
  const drafts: SignalDraft[] = [];
  const obs = ctx.observations;

  const regulatorHits = obs.filter((item) => item.sourceType === "regulator" && exactHit(observationText(item), ctx.entity));
  const exactWarnings = obs.filter((item) => {
    if (item.sourceType !== "regulator") return false;
    return countsAsRegulatorWarning({ title: item.title, url: item.url, content: item.text }, ctx.entity);
  });
  const alertExact = exactWarnings.find((item) => exactInTitleOrUrl(item.title, item.url, ctx.entity))
    ?? exactWarnings.find((item) => isGovNotice(item.url))
    ?? exactWarnings[0];
  const pickedProfile = pickInstitutionProfile(
    obs.filter((item) => isInstitutionProfile(item.url)).map((item) => item.url),
    ctx.entity,
  );
  const licenceHit = obs.find((item) => item.sourceType === "regulator" && licenceRegister(item, ctx.entity, pickedProfile));
  const alertFuzzy = regulatorHits.find((item) => isWarning(observationText(item)) && fuzzyToken(observationText(item), ctx.entity) && !exactHit(observationText(item), ctx.entity));

  if (alertExact) {
    drafts.push(draft("R1", 1, 1, [alertExact.evidenceId], "The entity's domain or exact name appears on a regulator alert entry.", alertExact.text));
  } else if (licenceHit) {
    drafts.push(draft("M1", 0.98, 1, [licenceHit.evidenceId], "An official register lists this domain as licensed.", licenceHit.text));
  } else if (alertFuzzy) {
    drafts.push(draft("R2", 0.72, 1, [alertFuzzy.evidenceId], "A regulator alert mentions a distinctive part of the name, not the exact domain.", alertFuzzy.text));
  }

  const pressWarnings = uniqueDomain(
    obs.filter((item) => {
      if (item.sourceType === "regulator" || item.sourceType === "own_site") return false;
      if (item.action !== "search_news" && item.action !== "search_reports") return false;
      if (isStorageArtefact(item.url) || isPdf(item.url) || isBrandPressRelease(item.url)) return false;
      if (!exactInTitleOrUrl(item.title, item.url, ctx.entity)) return false;
      const blob = observationText(item);
      if (!REGULATOR_NAME.test(blob)) return false;
      return isWarning(blob) || /watchlist|watch list|\bflags\b|\bfake\b|impersonat/i.test(blob);
    }),
  );
  if (!alertExact && pressWarnings.length >= 2) {
    drafts.push(draft(
      "R3",
      1,
      1,
      pressWarnings.map((item) => item.evidenceId),
      "At least two independent reports quote a regulator warning for this exact name.",
      pressWarnings[0]?.text ?? "",
    ));
  }

  const complaints = uniqueDomain(
    obs.filter((item) => item.action === "search_reports" && COMPLAINT.test(item.text) && mentionsEntity(item.text, ctx.entity) && item.sourceType !== "regulator"),
  );
  if (complaints.length >= 2) {
    drafts.push(draft("C1", 0.86, 0.7, complaints.map((item) => item.evidenceId), "At least two independent sites carry complaint reports.", complaints[0]?.text ?? ""));
  } else if (complaints.length === 1 && complaints[0]) {
    drafts.push(draft("C2", 0.8, 0.7, [complaints[0].evidenceId], "One independent site carries a complaint.", complaints[0].text));
  }

  const news = obs.find((item) => item.action === "search_news" && COMPLAINT.test(item.text) && mentionsEntity(item.text, ctx.entity));
  if (news) {
    drafts.push(draft("C3", 0.85, 0.9, [news.evidenceId], "A news or police item links the entity to a scam.", news.text));
  }

  const digits = phoneDigits(ctx.entity.canonical.phone);
  if (digits) {
    const phoneHit = obs.find((item) => item.action === "search_reports" && COMPLAINT.test(item.text) && item.text.replace(/\D/g, "").includes(digits.slice(-8)));
    if (phoneHit) {
      drafts.push(draft("P1", 0.9, 0.7, [phoneHit.evidenceId], "The phone number appears in a scam report.", phoneHit.text));
    }
  }

  if (ctx.ageDays !== null && ctx.ageDays < 365) {
    const weight = ctx.ageDays < 90 ? 15 : 8;
    const rdap = obs.find((item) => item.action === "rdap");
    drafts.push({
      ...draft("D1", 1, 1, rdap ? [rdap.evidenceId] : [], `Registration age is about ${ctx.ageDays} days.`, rdap?.text ?? ""),
      weight,
    });
  }

  if (ctx.ageDays !== null && ctx.ageDays > 365 * 5) {
    const positive = obs.filter((item) => item.action === "search_reports" && POSITIVE.test(item.text) && !COMPLAINT.test(item.text) && mentionsEntity(item.text, ctx.entity));
    if (positive.length >= 1 && positive[0]) {
      drafts.push(draft("M2", 0.9, 0.9, [positive[0].evidenceId], "The domain is older than five years and independent write-ups are ordinary reviews.", positive[0].text));
    }
  }

  const crawled = obs.some((item) => item.action === "crawl_site" && item.text.trim().length > 0);
  if (ctx.mapUrls.length > 0 || ctx.ownSiteText) {
    const paths = ctx.mapUrls.map((url) => url.toLowerCase());
    const legal = ["terms", "privacy", "refund", "contact"].filter((token) => paths.some((url) => url.includes(token)));
    const home = obs.find((item) => item.action === "extract_pages") ?? obs.find((item) => item.sourceType === "own_site");
    const evidenceId = home?.evidenceId;
    if (crawled && legal.length <= 1 && evidenceId) {
      drafts.push(draft("S1", 0.9, 1, [evidenceId], "The site map is missing most legal and contact pages.", home?.text ?? ""));
    }
    if (crawled && !paths.some((url) => url.includes("refund")) && !hasWorkableRefund(ctx.ownSiteText) && evidenceId) {
      drafts.push(draft("S2", 0.95, 1, [evidenceId], "No workable refund policy was found on the site.", home?.text ?? ""));
    }
    if ((MESSENGER.test(ctx.ownSiteText) || FREE_EMAIL.test(ctx.ownSiteText)) && !ADDRESS.test(ctx.ownSiteText) && evidenceId) {
      drafts.push(draft("S3", 0.9, 1, [evidenceId], "The only contact path is a messenger or a free email account, with no street address.", home?.text ?? ""));
    }
    if (RETURNS.test(ctx.ownSiteText) && evidenceId) {
      drafts.push(draft("I1", 0.92, 1, [evidenceId], "The site promises a guaranteed or weekly return.", home?.text ?? ""));
    }
    const licenceClaim = /licen[cs]ed by|regulated by|authorised by|authorized by/i.test(ctx.ownSiteText);
    if (licenceClaim && ctx.registrationChecked && !licenceHit && evidenceId) {
      drafts.push(draft("S4", 0.9, 1, [evidenceId], "The site claims a licence, and the register check did not confirm it.", home?.text ?? ""));
    }
    if (INJECTION.test(ctx.ownSiteText) && evidenceId) {
      drafts.push(draft("X1", 0.99, 1, [evidenceId], "The page tries to instruct the investigator. The phrase was treated as data, and as a risk indicator.", home?.text ?? ""));
    }
    if (UEN.test(ctx.ownSiteText) && licenceHit && evidenceId) {
      drafts.push(draft("M3", 0.85, 1, [evidenceId], "A business registration number appears on the official site and the register lists the domain.", home?.text ?? ""));
    }
  }

  const pressure = obs.find((item) => PRESSURE.test(item.text) && mentionsEntity(item.text, ctx.entity));
  if (pressure) {
    drafts.push(draft("I2", 0.8, 0.7, [pressure.evidenceId], "A report describes pressure or a personal-account payment.", pressure.text));
  }

  if (ctx.copycats.length > 0) {
    const hit = obs.find((item) => item.action === "find_copycats") ?? obs[0];
    if (hit) {
      drafts.push(draft("S5", 0.8, 0.7, [hit.evidenceId], `Other domains share distinctive wording: ${ctx.copycats.join(", ")}.`, hit.text));
    }
  }

  if (ctx.entity.canonical.domain) {
    const official = isOfficialBrand(ctx.entity.canonical.domain);
    if (official) {
      const home = obs.find((item) => item.action === "extract_pages") ?? obs[0];
      drafts.push(draft("M4", 1, 1, home ? [home.evidenceId] : [], `${official.name} is the official domain on the comparison list.`, home?.text ?? official.domain));
    } else {
      const brand = lookalikeOf(ctx.entity.canonical.domain);
      if (brand) {
        const home = obs.find((item) => item.action === "extract_pages") ?? obs[0];
        if (home) {
          drafts.push(draft("S6", 0.95, 1, [home.evidenceId], `The domain imitates ${brand.domain} (${brand.name}).`, home.text));
        }
      }
    }
  }

  if (ctx.vision && !ctx.vision.skipped && !ctx.vision.error) {
    const shot = obs.find((item) => item.action === "screenshot");
    if (shot && ctx.vision.impersonation && (ctx.vision.impersonationKind === "bank" || ctx.vision.impersonationKind === "government")) {
      drafts.push(draft("V1", ctx.vision.confidence, 0.8, [shot.evidenceId], ctx.vision.finding, ctx.vision.finding));
    }
    if (shot && ctx.vision.stockPhoto) {
      drafts.push(draft("V2", ctx.vision.confidence, 0.8, [shot.evidenceId], ctx.vision.finding, ctx.vision.finding));
    }
    if (shot && ctx.vision.fakeBadges) {
      drafts.push(draft("V3", Math.min(0.9, ctx.vision.confidence), 0.8, [shot.evidenceId], ctx.vision.finding, ctx.vision.finding));
    }
  }

  const merchantContext = /merchant|seller|shop|store|marketplace|invoice|order/i.test(ctx.entity.context);
  const personal = ctx.entity.entity_type === "payee" || ctx.entity.entity_type === "phone" || ctx.entity.canonical.names.some((name) => /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(name));
  if (merchantContext && personal) {
    const basis = complaints[0] ?? obs[0];
    if (basis) {
      drafts.push(draft("A1", 1, 1, [basis.evidenceId], "The payee is a person or a phone number, while the context describes a merchant payment.", basis.text));
    }
  }

  return dedupe(drafts.filter((item) => item.evidence_ids.length > 0 && item.evidence_ids.every(Boolean)));
}

function hasWorkableRefund(text: string): boolean {
  if (REFUND_DENIAL.test(text)) return false;
  return WORKABLE_REFUND.test(text);
}

function draft(signal_id: string, confidence: number, source_reliability: number, evidence_ids: string[], explanation: string, quote: string): SignalDraft {
  return {
    signal_id,
    confidence,
    source_reliability,
    evidence_ids,
    explanation,
    quote: quote.slice(0, 280),
  };
}

function uniqueDomain(items: Observation[]): Observation[] {
  const seen = new Set<string>();
  const out: Observation[] = [];
  for (const item of items) {
    if (seen.has(item.sourceDomain)) continue;
    seen.add(item.sourceDomain);
    out.push(item);
  }
  return out;
}

function dedupe(drafts: SignalDraft[]): SignalDraft[] {
  const byId = new Map<string, SignalDraft>();
  for (const item of drafts) {
    const prev = byId.get(item.signal_id);
    if (!prev || Math.abs(item.weight ?? 0) > Math.abs(prev.weight ?? 0)) byId.set(item.signal_id, item);
  }
  return [...byId.values()];
}

export function regulatorBeacon(text: string, entity: NormalizedEntity): "red" | "green" | undefined {
  if (!exactHit(text, entity)) return undefined;
  if (isWarning(text)) return "red";
  if (LICENCE.test(text) && !NEGATION.test(text) && !isWarning(text)) return "green";
  return undefined;
}

export function independentSources(observations: Observation[]): number {
  return new Set(observations.map((item) => item.sourceDomain).filter(Boolean)).size;
}
