/**
 * Illustrative evidence for the hero scorecard. Names and sites are fictional.
 * The advisory score uses only tiles with an illustrative finding.
 * Weights: regulator 40, contact 20, site 15, domain 10, reviews 10.
 * A tile with no source scores 0 and says so.
 */

export const ILLUSTRATIVE_LABEL = "Illustrative example — names and sites are fictional";

export type Tone = "adverse" | "caution" | "unknown";

export interface SignalTile {
  id: "regulator" | "contact" | "domain" | "reviews" | "payment" | "site";
  label: string;
  tone: Tone;
  finding: string;
  points: number;
}

export interface EvidenceNode {
  id: string;
  label: string;
  kind: string;
  tone: Tone;
  finding: string;
  quote: string;
  url: string;
  source: string;
}

export interface PublicCase {
  id: string;
  chip: string;
  subject: string;
  sample: string;
  matches: string[];
  line: string;
  tiles: SignalTile[];
  nodes: EvidenceNode[];
  memo: string[];
}

export const PUBLIC_CASES: PublicCase[] = [
  {
    id: "quarnby-investment-bank",
    chip: "Investment clone",
    subject: "The Quarnby Investment Bank",
    sample: "quarnby-markets.com",
    matches: [
      "quarnby-markets.com",
      "www.quarnby-markets.com",
      "the quarnby investment bank",
      "+1 202 555 0101",
    ],
    line: "FCO warning, first published 08/05/2025. Illustrative sources, not a live check.",
    tiles: [
      {
        id: "regulator",
        label: "Regulator",
        tone: "adverse",
        finding: "FCO: not authorised. Called a clone firm.",
        points: 40,
      },
      {
        id: "contact",
        label: "Identity",
        tone: "adverse",
        finding: "FCO: +1 202 555 0101. Westhaven has no connection.",
        points: 20,
      },
      {
        id: "domain",
        label: "Domain age",
        tone: "unknown",
        finding: "Not in the cited sources",
        points: 0,
      },
      {
        id: "reviews",
        label: "Reviews",
        tone: "unknown",
        finding: "Not in the cited sources",
        points: 0,
      },
      {
        id: "payment",
        label: "Payment",
        tone: "unknown",
        finding: "Not in the cited sources",
        points: 0,
      },
      {
        id: "site",
        label: "Site",
        tone: "adverse",
        finding: "FCO lists www.quarnby-markets.com",
        points: 15,
      },
    ],
    nodes: [
      {
        id: "fco",
        label: "FCO warning",
        kind: "Regulator",
        tone: "adverse",
        finding: "Not authorised. FCO calls it a clone of an authorised firm.",
        quote:
          "This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm.",
        url: "https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm",
        source: "Financial Conduct Office (FCO)",
      },
      {
        id: "cashback",
        label: "Rebate Island",
        kind: "News",
        tone: "adverse",
        finding: "Repeats the FCO name, phone +1 202 555 0101, and website.",
        quote:
          "Name: The Quarnby Investment Bank (Clone of FCO Authorised firm). Phone: +1 202 555 0101. Website: www.quarnby-markets.com.",
        url: "https://www.rebate-island.example/en/fco-updates-blacklist-exposing-multiple-unauthorized-forex-platforms/",
        source: "Rebate Island",
      },
      {
        id: "vsf",
        label: "Consumer Watch Forum",
        kind: "News",
        tone: "adverse",
        finding: "Lists this FCO warning as new on 08/05/2025.",
        quote:
          "The Quarnby Investment Bank (Clone of FCO Authorised firm) (new) — 08/05/2025.",
        url: "https://consumer-watch.example/2025-05-08/warnungen-der-englischen-finanzmarktaufsicht-fco-182-367224/",
        source: "Consumer Watch Forum",
      },
    ],
    memo: [
      "The UK Financial Conduct Office (FCO) warning “The Quarnby Investment Bank (Clone of FCO Authorised firm)”, first published 08/05/2025, says: “This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm.”",
      "Under “Clone firm details” the same page says “Fraudsters are using the following details to scam people” and lists telephone +1 202 555 0101, email support@quarnby-markets.com, and website www.quarnby-markets.com. The email is published on the page in obfuscated form and decodes to that address.",
      "Under “FCO authorised firm details” the page says: “This is the genuine, authorised firm that the fraudsters are claiming to work for. It has no connection with the clone firm.” It names Westhaven Bank Plc, Firm Reference Number 000001, telephone +44 1632 960001, website www.westhavenbank.example.",
      "The page also says that dealing with this firm means no access to the Financial Mediation Office, and no protection from the Financial Recovery Scheme if things go wrong.",
      "Rebate Island’s article “FCO Updates Blacklist, Exposing Multiple Unauthorized Forex Platforms” (page shows Updated: 2025/10/13) says it compiled the FCO warning list for 6–9 May 2025. In that list it repeats the name, phone +1 202 555 0101, and website www.quarnby-markets.com.",
      "Consumer Watch Forum, 8 May 2025, “Warnungen der englischen Finanzmarktaufsicht FCO”, lists “The Quarnby Investment Bank (Clone of FCO Authorised firm) (new)” with 08/05/2025 and links to the FCO warning.",
      "No page cited here states a domain registration date, a review-site score, or a payment method. Those tiles stay empty. The number on the gauge is Scam Scout’s advisory score from the tiles that do have a source. It is not an FCO rating and it is not a fraud finding.",
    ],
  },
  {
    id: "northgate-markets",
    chip: "Bank impersonation",
    subject: "northgate-markets.example",
    sample: "northgate-markets.example",
    matches: ["northgate-markets.example", "www.northgate-markets.example"],
    line: "FCO warning, first published 13/04/2026, updated 02/06/2026. Illustrative sources, not a live check.",
    tiles: [
      {
        id: "regulator",
        label: "Regulator",
        tone: "adverse",
        finding: "FCO: not authorised. Called a clone firm.",
        points: 40,
      },
      {
        id: "contact",
        label: "Identity",
        tone: "adverse",
        finding: "FCO lists two phones. Northgate Bank UK has no connection.",
        points: 20,
      },
      {
        id: "domain",
        label: "Domain age",
        tone: "caution",
        finding: "RDAP: registered 14 Jan 2026.",
        points: 10,
      },
      {
        id: "reviews",
        label: "Reviews",
        tone: "caution",
        finding: "TrustLens score 56: slightly low, unsure.",
        points: 10,
      },
      {
        id: "payment",
        label: "Payment",
        tone: "unknown",
        finding: "Not in the cited sources",
        points: 0,
      },
      {
        id: "site",
        label: "Site",
        tone: "adverse",
        finding: "FCO: targeting people in the UK, claiming to be authorised.",
        points: 15,
      },
    ],
    nodes: [
      {
        id: "fco",
        label: "FCO warning",
        kind: "Regulator",
        tone: "adverse",
        finding: "Not authorised. Genuine firm named is Northgate Bank UK Limited, with no connection.",
        quote:
          "This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm.",
        url: "https://www.fco.example/news/warnings/northgate-markets-example-clone-fco-authorised-firm",
        source: "Financial Conduct Office (FCO)",
      },
      {
        id: "rdap",
        label: "registry lookup",
        kind: "Domain record",
        tone: "caution",
        finding: "Registration event 14 Jan 2026. Registrar NameHarbour, LLC.",
        quote:
          "ldhName: NORTHGATE-MARKETS.EXAMPLE. eventAction: registration. eventDate: 2026-01-14T17:32:37Z. Registrar: NameHarbour, LLC (IANA registrar ID 1479).",
        url: "https://rdap.registry.example/com/v1/domain/northgate-markets.example",
        source: "registry lookup",
      },
      {
        id: "trustlens",
        label: "TrustLens",
        kind: "Review",
        tone: "caution",
        finding: "Trust score 56. The page says it is unsure if the site is legit.",
        quote:
          "northgate-markets.example has a slightly low trust score. In summary, we checked northgate-markets.example and we are unsure if the website is legit.",
        url: "https://www.trustlens.example/check-website/northgate-markets.example",
        source: "TrustLens",
      },
    ],
    memo: [
      "The FCO warning “northgate-markets.example (Clone of FCO authorised firm)”, first published 13/04/2026 and last updated 02/06/2026, says the firm “is not authorised or registered by the FCO but has been targeting people in the UK, claiming to be an authorised firm.” The body says: “This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm.”",
      "Under “Clone firm details” the page says “Fraudsters are using the following details to scam people” and lists telephones 01632 960003 and 01632 960004, and email addresses in the form 'name'@northgate-markets.example.",
      "Under “FCO authorised firm details” the page says: “This is the genuine, authorised firm that the fraudsters are claiming to work for. It has no connection with the clone firm.” It names Northgate Bank UK Limited, Firm Reference Number 000002, telephone +44 1632 960002, website www.northgate-group.example.",
      "The page also says that dealing with this firm means no access to the Financial Mediation Office, and no protection from the Financial Recovery Scheme if things go wrong.",
      "Registry’s RDAP record for NORTHGATE-MARKETS.EXAMPLE, includes a registration event dated 2026-01-14T17:32:37Z, an expiration event dated 2027-01-14T17:32:37Z, and registrar NameHarbour, LLC (IANA registrar ID 1479). The record does not say why the domain was registered.",
      "TrustLens’s page for northgate-markets.example shows trust score 56 and says “northgate-markets.example has a slightly low trust score” and “we are unsure if the website is legit.” The same page lists WHOIS registration date 2026-01-14, which matches the RDAP date. TrustLens does not call the site a confirmed scam.",
      "No page cited here names a payment method. That tile stays empty. The gauge is Scam Scout’s advisory score from the cited tiles. It is not an FCO score, not TrustLens’s score, and not a fraud finding.",
    ],
  },
];

export function scoreOf(item: PublicCase): number {
  return item.tiles.reduce((sum, tile) => sum + tile.points, 0);
}

export function levelOf(score: number): "High" | "Medium" | "Low" {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export function publicCaseFor(input: string): PublicCase | undefined {
  const needle = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!needle) return undefined;
  return PUBLIC_CASES.find((item) => item.matches.some((match) => match === needle) || item.subject.toLowerCase() === needle);
}

export function publicCaseById(id: string): PublicCase {
  return PUBLIC_CASES.find((item) => item.id === id) ?? PUBLIC_CASES[0];
}

/** Example picks under the hero search box. Each fills the box; Check then opens its recorded case. */
export const EXAMPLE_PICKS: Array<{ kind: string; value: string }> = [
  { kind: "Website", value: "quarnby-markets.com" },
  { kind: "Phone", value: "+1 202 555 0101" },
  { kind: "Payee", value: "The Quarnby Investment Bank" },
  { kind: "Website", value: "northgate-markets.example" },
];
