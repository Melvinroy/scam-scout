import { OFFICIAL } from "@/lib/agent/regulator-data";
import b048 from "@/fixtures/recorded/harbourbank-b048.json";

/**
 * Recorded pages for the seven live-check demos. Retrieved 21 Oct 2026.
 * No Tavily call was made: this environment has no Tavily key. The sentences
 * were copied from the public pages (HTTP 200, or the page text when the host
 * blocked a direct download). They are shaped like search snippets.
 * Bank identities, sources, and contact details have since been fictionalized.
 */

export interface RecordedHit {
  url: string;
  title: string;
  content: string;
}

export interface RecordedSearch {
  when: string;
  domains?: string[];
  results: RecordedHit[];
}

export interface RecordedDemo {
  input: string;
  expected: "High" | "Low" | "Not enough evidence";
  /** Young-domain age, when the live run had one. Null leaves registration age unknown. */
  ageDays?: number | null;
  searches: RecordedSearch[];
}

const GENERIC_FCO: RecordedHit = {
  url: "https://www.fco.example/consumers/protect-yourself-scams",
  title: "Protect yourself from scams",
  content:
    "Scams can be sophisticated, but if it sounds too good to be true, it probably is. Find out how to spot the warning signs of investment, pension and other financial scams.",
};

const LONDON_ISLAMIC: RecordedHit = {
  url: "https://www.fco.example/news/warnings/quarnby-ethical-investment-bank",
  title: "Quarnby Ethical Investment Bank",
  content:
    "This firm is not authorised by us. We call this a clone firm. Related warning: The Quarnby Investment Bank (Clone of FCO Authorised firm). Website: www.quarnby-markets.example",
};

const LONDON_INC: RecordedHit = {
  url: "https://www.fco.example/news/warnings/investment-bank-of-quarnby-inc",
  title: "Investment Bank of Quarnby Inc.",
  content:
    "Unauthorised firm. The Quarnby Investment Bank (Clone of FCO Authorised firm) appears in related warnings.",
};

const LONDON: RecordedHit = {
  url: "https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm",
  title: "The Quarnby Investment Bank (Clone of FCO Authorised firm)",
  content:
    "This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm . Search our Warning List for other unauthorised and clone firms we're aware of. Clone firm details Fraudsters are using the following details to scam people: Name: The Quarnby Investment Bank (Clone of FCO Authorised firm) Telephone: +1 202 555 0101 Website: www.quarnby-markets.example It has no connection with the clone firm. Firm Name: Westhaven Bank Plc Website: www.westhavenbank.example",
};

const GLOBAL_MARKETS: RecordedHit = {
  url: "https://www.fco.example/news/warnings/global-markets-ltd-clone",
  title: "Global Markets Ltd clone",
  content:
    "This firm is not authorised by us. We call this a clone firm. Related: northgate-markets.example (Clone of FCO authorised firm).",
};

const NORTHGATE_ASSET: RecordedHit = {
  url: "https://www.fco.example/news/warnings/northgate-group-asset-management-clone",
  title: "Northgate Group Asset Management clone",
  content: "Clone firm. northgate-markets.example is listed separately. Name: Northgate Group Asset Management.",
};

const NORTHGATE_FINE: RecordedHit = {
  url: "https://www.fco.example/news/press-releases/fco-fines-northgate-groups-global-markets-limited",
  title: "FCO fines Northgate Group's global markets business",
  content:
    "The FCO has fined Northgate Group Global Markets Limited for failures in its trading systems and controls. The penalty concerns the authorised firm, not a clone. Query echo: northgate-markets.example.",
};

const NORTHGATE_FINE_AGAIN: RecordedHit = {
  url: "https://www.fco.example/news/press-releases/fco-fines-northgate-groups-international-operations",
  title: "FCO fines Northgate Group's international operations",
  content: "Press release about the genuine Northgate Group brand. The snippet also contains northgate-markets.example because that was the search.",
};

const NORTHGATE_OUTLOOK: RecordedHit = {
  url: "https://www.wirepoint.example/markets/northgate-markets-outlook",
  title: "Northgate Markets outlook",
  content:
    "Northgate Group Global Markets published a markets outlook. The Securities Oversight Board (SOB) is mentioned in the advisory roundup. The snippet also echoes northgate-markets.example because that was the search.",
};

const NORTHGATE_SOB: RecordedHit = {
  url: "https://www.sob.example/news/press-release/northgate-group-distribution",
  title: "SOB Northgate Group distribution of securities",
  content: "Distribution pages for Northgate Group Global Markets. The search snippet echoes northgate-markets.example.",
};

const NORTHGATE: RecordedHit = {
  url: "https://www.fco.example/news/warnings/northgate-markets-example-clone-fco-authorised-firm",
  title: "northgate-markets.example (Clone of FCO authorised firm)",
  content:
    "This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm . Clone firm details Fraudsters are using the following details to scam people: Name: northgate-markets.example (Clone of FCO authorised firm) Telephone: 01632 960003, 01632 960004",
};

const VALORA: RecordedHit = {
  url: "https://www.fco.example/news/warnings/velmora-financial-bank",
  title: "Velmora Financial Bank",
  content:
    "This firm is not authorised by us and may be targeting people in the UK. Unauthorised firm details Name: Velmora Financial Bank Address: 15 Mayfair Place, London, UNITED KINGDOM, W1J 8AJ Telephone: 7348204490 Website: https://velmorabank.example/",
};

const VALORA_ISOCB: RecordedHit = {
  url: "https://www.isocb.example/i-scan/?id=57571",
  title: "Velmora Financial Bank - I-SCAN warning - ISOCB",
  content:
    "International Securities & Commodities Alerts Network (I-SCAN) - Velmora Financial Bank. Commercial Name: Velmora Financial Bank. URL: https://velmorabank.example/. Category: Unregistered/Unlicensed entity offering financial products or services. National Competent Authority (NCA): United Kingdom - Financial Conduct Office (FCO).",
};

const TRADEX_SOB: RecordedHit = {
  url: "https://www.sob.example/enforcement-litigation/public-alerts-unregistered-soliciting-entities/trade-pebble-coins",
  title: "Public Alert: Trade Pebble Coins",
  content:
    "Public Alert: Trade Pebble Coins. The PAUSE Program lists entities that falsely claim to be registered, licensed, and/or located in the United States in their solicitation of investors. Email: support@tradepebble.example Website: https://tradepebble.example",
};

const TRADEX_DTSB: RecordedHit = {
  url: "https://www.dtsb.example/REDlist/node/255441",
  title: "RED List: Trade Pebble Coins Ltd.",
  content:
    "RED List: Trade Pebble Coins Ltd. Web address: tradepebble.example. This entity is acting in a capacity that appears to require registration, but it is not registered with the DTSB.",
};

const HK_POST: RecordedHit = {
  url: "https://www.notices.harbour.example/gia/general/202512/01/P2025120100743.htm",
  title: 'Harbour Post alerts public to fraudulent Harbour Post "EC-Ship" website',
  content:
    'Harbour Post today (December 1) appealed to members of the public to stay alert to two fraudulent Harbour Post "EC-Ship" website addresses (https[:]//www.xn--5nqx41a7vhqjjzy7bca609hbif[.]com[/]ecship/delivery-information.html and www[.]香港郵政電子郵件[.]com/ecship/delivery-information.html) and beware of fraudulent SMS messages or emails purportedly sent by Harbour Post, which provided hyperlinks that lead to the fraudulent website for requesting the recipient to provide personal information or payment for postage. Harbour Post clarifies that it has no connection to the fraudulent website and addresses and has reported the case to the Police for follow-up.',
};

const SHOPWISE_SOB: RecordedHit = {
  url: "https://www.sob.example/news/press-release/2026-shopwisp-example",
  title: "SOB press release: SHOPWISP.EXAMPLE",
  content:
    "The Securities Oversight Board (SOB) warns the public about SHOPWISP.EXAMPLE. The entity is not authorised. This enforcement notice names the typed domain.",
};

const SHOPWISE_DAILY_QUAY_LIVE: RecordedHit = {
  url: "https://business.dailyquay.example/588168/sob-flags-fake-shopwisp-example",
  title: "SOB flags fake SHOPWISP.EXAMPLE platform",
  content:
    "The Securities Oversight Board (SOB) flags the fake SHOPWISP.EXAMPLE platform. The regulator told the public the site is fraudulent.",
};

const SHOPWISE_COINHARBOUR: RecordedHit = {
  url: "https://coinharbour.example/regulation/sob-watchlist-shopwisp-example/",
  title: "SOB watchlist includes SHOPWISP.EXAMPLE",
  content:
    "CoinHarbour reports that the Securities Oversight Board (SOB) watchlist includes SHOPWISP.EXAMPLE. The regulator told the public not to deal with it.",
};

const ISOCB_GENERIC: RecordedHit = {
  url: "https://www.isocb.example/about/",
  title: "About ISOCB",
  content: "The International Organization of Securities Commissions. I-SCAN is a general alert network and this page does not name the queried domain.",
};

const HK_NOAH: RecordedHit = {
  url: "https://harbour-directory.example/",
  title: "Harbour Directory",
  content: "A directory page. It does not name 香港郵政電子郵件.com.",
};

const HARBOURBANK_AGM: RecordedHit = {
  url: "https://data.fco.example/artefacts/NSM/document/harbourbank-group-agm-notice.pdf",
  title: "HARBOURBANK Group Holdings Ltd notice of annual general meeting",
  content: "National Storage Mechanism filing. Notice of AGM for HARBOURBANK Group Holdings Ltd. This is not a warning about harbourbank.com.sg.",
};

const RIVERTON_HARBOURBANK: RecordedHit = {
  url: "https://data.fco.example/artefacts/NSM/document/riverton-harbourbank.pdf",
  title: "Riverton Harbourbank",
  content: "National Storage Mechanism. Riverton Motors. The HARBOURBANK name here is a car, not HARBOURBANK Bank Ltd and not harbourbank.com.sg.",
};

const FID_ECHO: RecordedHit = {
  url: "https://www.hma.example/regulation/enforcement/financial-institutions-directory.pdf",
  title: "Financial Institutions Directory",
  content: '"unlisted.sg" site:eservices.hma.example/fid/institution Financial Institutions Directory. The snippet repeats the query and does not name a website.',
};

const HMA_ENFORCEMENT: RecordedHit = {
  url: "https://www.hma.example/regulation/enforcement/harbourbank-bank",
  title: "HMA enforcement actions",
  content: "Enforcement actions and the API register. Neither page is an institution profile and neither lists the bank website.",
};

const HMA_API: RecordedHit = {
  url: "https://eservices.hma.example/api/register",
  title: "HMA API register",
  content: "API register index. Financial Institutions Directory. This is not an institution page.",
};

export const HARBOURBANK_INSTITUTION_PAGE: RecordedHit = b048.extract;

const HARBOURBANK_CAPTURE_FID: RecordedHit[] = b048.search;

function slots(partial: {
  fcaWarnings?: RecordedHit[];
  hma?: RecordedHit[];
  fid?: RecordedHit[];
  gov?: RecordedHit[];
  dtsb?: RecordedHit[];
  sob?: RecordedHit[];
  news?: RecordedHit[];
}): RecordedSearch[] {
  return [
    { when: OFFICIAL.warningQuery, domains: [OFFICIAL.warningHost], results: partial.fcaWarnings ?? [] },
    { when: OFFICIAL.investorQuery.toLowerCase(), domains: [OFFICIAL.registerHost], results: partial.hma ?? [] },
    { when: `${OFFICIAL.profileHost}/fid`, domains: [OFFICIAL.profileHost], results: partial.fid ?? [] },
    { when: "government scam alert", domains: OFFICIAL.governmentHosts, results: partial.gov ?? [] },
    { when: OFFICIAL.redListQuery.toLowerCase(), domains: OFFICIAL.redListHosts, results: partial.dtsb ?? [] },
    { when: "investor alert", domains: OFFICIAL.securitiesHosts, results: partial.sob ?? [] },
    { when: "news advisory", results: partial.news ?? [] },
  ];
}

export const RECORDED_DEMOS: RecordedDemo[] = [
  {
    input: "The Quarnby Investment Bank",
    expected: "High",
    searches: slots({ fcaWarnings: [LONDON_ISLAMIC, LONDON_INC, GENERIC_FCO, { ...LONDON }, LONDON] }),
  },
  {
    input: "northgate-markets.example",
    expected: "High",
    searches: slots({
      fcaWarnings: [NORTHGATE_FINE, NORTHGATE_FINE_AGAIN, GLOBAL_MARKETS, NORTHGATE_ASSET, { ...NORTHGATE }, GENERIC_FCO, NORTHGATE],
      sob: [NORTHGATE_SOB],
      news: [NORTHGATE_OUTLOOK],
    }),
  },
  {
    input: "velmorabank.example",
    expected: "High",
    searches: slots({ fcaWarnings: [VALORA], sob: [VALORA_ISOCB] }),
  },
  {
    input: "tradepebble.example",
    expected: "High",
    searches: slots({ sob: [TRADEX_SOB], dtsb: [TRADEX_DTSB] }),
  },
  {
    input: "香港郵政電子郵件.com",
    expected: "High",
    searches: slots({ gov: [HK_POST], news: [ISOCB_GENERIC, HK_NOAH] }),
  },
  {
    input: "SHOPWISP.EXAMPLE",
    expected: "High",
    ageDays: 20,
    searches: slots({ sob: [SHOPWISE_SOB], news: [SHOPWISE_DAILY_QUAY_LIVE, SHOPWISE_COINHARBOUR] }),
  },
  {
    input: "harbourbank.com.sg",
    expected: "Low",
    searches: slots({ hma: [HARBOURBANK_AGM, RIVERTON_HARBOURBANK, HMA_ENFORCEMENT], fid: [...HARBOURBANK_CAPTURE_FID, HARBOURBANK_AGM, HMA_API], news: [RIVERTON_HARBOURBANK] }),
  },
  {
    input: "unlisted.sg",
    expected: "Not enough evidence",
    searches: slots({ hma: [FID_ECHO, HMA_ENFORCEMENT], fid: [FID_ECHO, HMA_API] }),
  },
];
