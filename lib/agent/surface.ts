import { domainToASCII } from "node:url";
import { getDomain } from "tldts";
import type { NormalizedEntity } from "@/lib/types";

export const REGULATOR_HOSTS = [
  "fco.example", "hma.example", "sob.example", "sob-ph.example", "isocb.example", "dtsb.example", "afo.example", "harbour.example", "notices.harbour.example", "police.harbour.example", "scamguard.example",
  "mas.gov.sg",
  "fca.org.uk",
  "sc.com.my",
  "police.gov.sg",
  "ftc.gov",
  "asic.gov.au",
  "sec.gov",
  "cftc.gov",
  "iosco.org",
  "finra.org",
  "investor.gov",
  "sec.gov.ph",
  "info.gov.hk",
  "police.gov.hk",
  "scamshield.gov.sg",
  "alerts.example",
  "register.example",
];

export function isRegulatorHost(domain: string): boolean {
  const host = domain.toLowerCase();
  return REGULATOR_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
}

/** Defanged warning pages write www[.]example[.]com and https[:]//. Put the dots back before matching. */
export function plainText(value: string): string {
  return value
    .replace(/\[\s*:\s*\]/g, ":")
    .replace(/\[\s*\.\s*\]|\(\s*\.\s*\)|\[\s*dot\s*\]|\(\s*dot\s*\)/gi, ".")
    .replace(/hxxps?/gi, (match) => match.toLowerCase().replace("hxxp", "http"));
}

export function normalizeSurface(value: string): string {
  return plainText(value).toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Drop separators so northgate-markets.com and the slug northgate-marketscom are the same key. */
export function compactKey(value: string): string {
  return plainText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

const LEADING_ARTICLE = /^(the|a|an)\s+/i;

/**
 * Keys from the typed input.
 * A domain uses the full host, including the TLD, so "Northgate Markets" cannot match northgate-markets.com.
 * A name uses the typed words, with and without a leading article.
 */
export function exactKeys(entity: NormalizedEntity): string[] {
  const keys = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    const key = compactKey(value);
    if (key.length > 3) keys.add(key);
  };
  const domain = entity.canonical.domain;
  if (domain) {
    add(domain);
    add(asciiHost(domain));
    add(entity.raw);
    add(asciiHost(entity.raw));
    return [...keys];
  }
  const addName = (value: string | undefined) => {
    if (!value) return;
    add(value);
    add(value.trim().replace(LEADING_ARTICLE, ""));
  };
  addName(entity.raw);
  for (const name of entity.canonical.names) addName(name);
  return [...keys];
}

function asciiHost(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  const ascii = domainToASCII(trimmed);
  if (!ascii || ascii.toLowerCase() === trimmed.toLowerCase()) return undefined;
  return ascii;
}

export function exactInputIn(text: string, entity: NormalizedEntity): boolean {
  const hay = compactKey(text);
  if (!hay) return false;
  return exactKeys(entity).some((key) => hay.includes(key));
}

export function exactInTitleOrUrl(title: string, url: string, entity: NormalizedEntity): boolean {
  return exactInputIn(`${title}\n${url}`, entity);
}

const FIRM_TITLE = /\b(clone|ltd|limited|inc|plc|bank|gmbh)\b/i;
const WARNING_PATH = /\/warnings?(?:\/|$)/i;
const ALERT_LISTING = /\/warnings?\/|\/redlist\b|\/i-scan\b|public-alerts?|investor-alerts?|warning-list/i;
const PRESS_RELEASE = /\/news\/press-releases?\//i;
const REGULATOR_NOTICE = /press-releases?|litigation|enforcement|\badvisory\b/i;
const GOV_NOTICE_HOSTS = ["info.gov.hk", "police.gov.hk", "scamshield.gov.sg", "police.gov.sg", "scamalert.sg"];
const WEBSITE_FIELD = /(?:website|web\s*address|url)\s*[:：]\s*(?:https?:\/\/)?(?:www\.)?([^\s,;<)"']+)/gi;
const BARE_URL = /https?:\/\/[^\s<>"')\]]+/gi;

/** Another firm's warning page. Kept only when the title or URL carries this input. */
export function isNearNameHit(hit: { title: string; url: string }): boolean {
  return WARNING_PATH.test(hit.url) || FIRM_TITLE.test(hit.title);
}

export function isBrandPressRelease(url: string): boolean {
  return PRESS_RELEASE.test(url);
}

export function isPdf(url: string): boolean {
  return /\.pdf(?:$|\?)/i.test(url);
}

/** Press release, advisory, litigation release, or enforcement notice. */
export function isRegulatorNotice(url: string, title: string): boolean {
  return REGULATOR_NOTICE.test(`${url} ${title}`);
}

/** Official National Storage Mechanism filings. An AGM notice is not a warning. */
export function isStorageArtefact(url: string): boolean {
  url = classifierUrl(url);
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "data.fca.org.uk" || host.endsWith(".data.fca.org.uk")) return true;
    return /\/nsm\/|national-storage-mechanism/i.test(`${host}${parsed.pathname}`);
  } catch {
    return /data\.fca\.org\.uk|\/nsm\//i.test(url);
  }
}

export function isGovNotice(url: string): boolean {
  url = classifierUrl(url);
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return GOV_NOTICE_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
  } catch {
    return false;
  }
}

export function isAlertListing(url: string): boolean {
  return ALERT_LISTING.test(url);
}

/** One institution profile, not the directory index. */
export function isInstitutionProfile(url: string): boolean {
  url = classifierUrl(url);
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "eservices.mas.gov.sg" && !host.endsWith(".eservices.mas.gov.sg")) return false;
    return /\/fid\/institution\/detail\//.test(parsed.pathname.toLowerCase());
  } catch {
    return /eservices\.mas\.gov\.sg\/fid\/institution\/detail\//i.test(url);
  }
}

/** Official FID institution page, or another register page that lists a firm's website. */
export function isRegisterPage(url: string): boolean {
  url = classifierUrl(url);
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();
    if (host === "eservices.mas.gov.sg" || host.endsWith(".eservices.mas.gov.sg")) return path.includes("/fid/institution/");
    if (host === "register.example" || host.endsWith(".register.example")) return /financial-institutions|\/firm\//.test(path);
    if (host.startsWith("register.") && /\/firm\/|financial-institutions|\/fid\//.test(path)) return true;
    return false;
  } catch {
    return /eservices\.mas\.gov\.sg\/fid\/institution\//i.test(url);
  }
}

export function regulatorPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const registered = (getDomain(host) || host).toLowerCase();
    return isRegulatorHost(host) || isRegulatorHost(registered);
  } catch {
    return false;
  }
}

/** A listed host and the typed domain, including a .com site and its .com.sg country site. */
export function sameOfficialSite(listed: string, typed: string): boolean {
  const left = registrableParts(listed);
  const right = registrableParts(typed);
  if (!left || !right) return listed === typed;
  if (left.label !== right.label || left.label.length < 3) return false;
  if (left.suffix === right.suffix) return true;
  return commercialCountryPair(left.suffix, right.suffix);
}

function registrableParts(host: string): { label: string; suffix: string } | null {
  const registered = (getDomain(host) || host).toLowerCase();
  const dot = registered.indexOf(".");
  if (dot <= 0) return null;
  return { label: registered.slice(0, dot), suffix: registered.slice(dot + 1) };
}

/** com.sg and com. au and com. A different second level, such as co.uk against com, does not pair. */
function commercialCountryPair(left: string, right: string): boolean {
  const pair = (country: string, global: string) => country.startsWith(`${global}.`) && country.slice(global.length + 1).length === 2 && global === "com";
  return pair(left, right) || pair(right, left);
}

/** Hosts named after a Website, Web address, or URL label. */
export function listedWebsites(text: string): string[] {
  return hostsIn(text, false);
}

/** A register page often prints the site as a bare URL under contact, with no Website label. */
export function registerWebsites(text: string): string[] {
  return hostsIn(text, true);
}

function hostsIn(text: string, bare: boolean): string[] {
  const found = new Set<string>();
  const plain = plainText(text);
  const add = (value: string) => {
    const host = hostOf(value);
    if (host) found.add(host);
  };
  for (const match of plain.matchAll(new RegExp(WEBSITE_FIELD.source, "gi"))) add(match[1] ?? "");
  if (bare) {
    for (const match of plain.matchAll(new RegExp(BARE_URL.source, "gi"))) add(match[0] ?? "");
  }
  return [...found];
}

export function listsTypedDomain(text: string, entity: NormalizedEntity, register = false): boolean {
  const domain = entity.canonical.domain?.toLowerCase();
  if (!domain) return false;
  const hosts = register ? registerWebsites(text) : listedWebsites(text);
  return hosts.some((host) => sameOfficialSite(host, domain));
}

/** Quoted forms a country-domain register search should include. harbourbank.com.sg also asks for harbourbank.com. */
export function officialSiteQueries(domain: string): string[] {
  const registered = (getDomain(domain) || domain).toLowerCase();
  const forms = new Set<string>([registered]);
  const parts = registrableParts(registered);
  if (parts && parts.label.length >= 3 && commercialCountryPair(parts.suffix, "com")) forms.add(`${parts.label}.com`);
  return [...forms];
}

const GENERIC_SLUG = new Set([
  "bank", "banks", "ltd", "limited", "plc", "inc", "incorporated", "pte", "co", "company",
  "berhad", "bhd", "sa", "ag", "nv", "llc", "lp", "group", "holdings",
]);

/** The name token an official institution slug leads with, after its numeric id. 900002-HARBOURBANK-BANK-LTD is harbourbank. */
export function institutionSlugLabel(url: string): string | null {
  let segment = "";
  try {
    if (!isInstitutionProfile(url)) return null;
    segment = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    return null;
  }
  const tokens = segment.split("-").filter(Boolean);
  if (/^\d+$/.test(tokens[0] ?? "")) tokens.shift();
  const label = (tokens[0] ?? "").toLowerCase();
  return label.length >= 3 ? label : null;
}

/** The profile slug names this domain's label. harbourbank.com.sg matches HARBOURBANK-BANK-LTD. harbourbank-secure.com.sg does not. */
export function institutionSlugMatches(url: string, entity: NormalizedEntity): boolean {
  const label = institutionSlugLabel(url);
  const domain = entity.canonical.domain;
  if (!label || !domain) return false;
  return registrableParts(domain)?.label === label;
}

/**
 * Among institution profiles whose slug names the typed label, prefer the profile
 * that is just that name. HARBOURBANK-BANK-LTD beats HARBOURBANK-DIGITAL-EXCHANGE-PTE-LTD.
 */
export function pickInstitutionProfile(urls: string[], entity: NormalizedEntity): string | null {
  const matches = urls.filter((url) => institutionSlugMatches(url, entity));
  if (matches.length === 0) return null;
  const specific = (url: string) => {
    let tokens: string[] = [];
    try {
      tokens = new URL(url).pathname.split("/").filter(Boolean).pop()?.split("-").filter(Boolean) ?? [];
    } catch {
      return 99;
    }
    if (/^\d+$/.test(tokens[0] ?? "")) tokens.shift();
    return tokens.slice(1).filter((token) => !GENERIC_SLUG.has(token.toLowerCase())).length;
  };
  return [...matches].sort((a, b) => specific(a) - specific(b) || a.localeCompare(b))[0] ?? null;
}

/** Directory chrome and the regulator's own links are not the institution's website. */
export function institutionContactHosts(text: string): string[] {
  return registerWebsites(text).filter((host) => !isDirectoryChrome(host));
}

function isDirectoryChrome(host: string): boolean {
  const value = classifierUrl(host.toLowerCase());
  return value.endsWith(".gov.sg") || value.endsWith(".gov.uk") || value.endsWith(".gov.au") || value.endsWith(".gov.hk") || value === "gov.sg";
}

/** Keep a non-chrome website that sits past the usual quote cap on a long register page. */
export function registerEvidenceQuote(url: string, content: string, limit = 900): string {
  if (!isRegisterPage(url) || content.length <= limit) return content.slice(0, limit);
  const matches = [...content.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)];
  const external = matches.find((match) => {
    try {
      const host = new URL(match[0]).hostname.toLowerCase().replace(/^www\./, "");
      const registered = (getDomain(host) || host).toLowerCase();
      return !isDirectoryChrome(host) && !isDirectoryChrome(registered);
    } catch {
      return false;
    }
  });
  const match = external ?? matches.find((item) => (item.index ?? 0) + item[0].length > limit);
  if (!match || match.index == null || match.index + match[0].length <= limit) return content.slice(0, limit);
  const start = Math.max(0, match.index - 240);
  return content.slice(start, start + limit);
}

function hostOf(value: string): string | null {
  const trimmed = value.trim().replace(/[),.;]+$/g, "");
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    return (getDomain(host) || host).toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A regulator warning for this input.
 * The typed domain or full name must be in the title or URL, unless a government
 * notice names it in the body or an alert list records it as the website.
 * On a regulator host, a press release, advisory, litigation release, or
 * enforcement notice that names the typed domain is a warning too.
 */
export function countsAsRegulatorWarning(
  hit: { title: string; url: string; content?: string },
  entity: NormalizedEntity,
): boolean {
  if (isStorageArtefact(hit.url) || (isPdf(hit.url) && !isRegisterPage(hit.url))) return false;
  if (isGovNotice(hit.url)) return exactInputIn(`${hit.title}\n${hit.url}\n${hit.content ?? ""}`, entity);
  if (isAlertListing(hit.url)) {
    if (/(?:fca\.org\.uk|fco\.example)/i.test(hit.url) && !/\/news\/warnings?\//i.test(hit.url)) return false;
    return exactInTitleOrUrl(hit.title, hit.url, entity) || listsTypedDomain(`${hit.title}\n${hit.content ?? ""}`, entity);
  }
  if (regulatorPage(hit.url) && isRegulatorNotice(hit.url, hit.title)) {
    return exactInTitleOrUrl(hit.title, hit.url, entity);
  }
  return false;
}

/** Fixture aliases use exactly the same page classifiers as official sources. */
export function classifierUrl(url: string): string {
  return url.replace(/fco\.example/gi, "fca.org.uk")
    .replace(/hma\.example/gi, "mas.gov.sg")
    .replace(/notices\.harbour\.example/gi, "info.gov.hk")
    .replace(/police\.harbour\.example/gi, "police.gov.hk")
    .replace(/scamguard\.example/gi, "scamshield.gov.sg");
}
