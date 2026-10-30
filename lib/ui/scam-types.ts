export interface ScamType {
  id: string;
  title: string;
  line: string;
  source: string;
  url: string;
  /** Recorded public case this row opens. Absent when we have no fixture. */
  caseId?: "quarnby-investment-bank" | "northgate-markets";
  /** When set, the opened file is shared with another row and the brief says why. */
  sameFileAs?: string;
  color: string;
}

/** Illustrative type descriptions with fictional names, sources, and quotes. */
export const SCAM_TYPES: ScamType[] = [
  {
    id: "clone",
    title: "Clone firm",
    line: "FCO: “pretending to be from firms we authorise. We call this a clone firm.”",
    source: "Financial Conduct Office (FCO)",
    url: "https://www.fco.example/consumers/clone-firms-individuals",
    caseId: "quarnby-investment-bank",
    color: "#ff5a36",
  },
  {
    id: "bank",
    title: "Bank impersonation",
    line: "FCO: not authorised or registered, targeting people in the UK while claiming to be an authorised firm.",
    source: "Financial Conduct Office (FCO)",
    url: "https://www.fco.example/news/warnings/northgate-markets-example-clone-fco-authorised-firm",
    caseId: "northgate-markets",
    color: "#c4233a",
  },
  {
    id: "investment",
    title: "Investment",
    line: "ScamGuard: promises of high returns.",
    source: "ScamGuard",
    url: "https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/investment-scams/",
    caseId: "quarnby-investment-bank",
    sameFileAs: "Clone firm",
    color: "#b45309",
  },
  {
    id: "job",
    title: "Job",
    line: "ScamGuard: too-good-to-be-true offers to job seekers.",
    source: "ScamGuard",
    url: "https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/job-scams/",
    color: "#4f46e5",
  },
  {
    id: "marketplace",
    title: "Marketplace",
    line: "ScamGuard: scammers take advantage of online shoppers, including suspicious listings and sellers.",
    source: "ScamGuard",
    url: "https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/e-commerce-scams/",
    color: "#0c8f7d",
  },
  {
    id: "romance",
    title: "Romance",
    line: "ScamGuard: “fake online relationships to gain trust, then ask for money using emotional stories.”",
    source: "ScamGuard",
    url: "https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/internet-love-scams/",
    color: "#ff5a36",
  },
  {
    id: "messages",
    title: "Messages",
    line: "ScamGuard: fake emails, messages, and calls used to steal banking details.",
    source: "ScamGuard",
    url: "https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/phishing-scams/",
    color: "#4f46e5",
  },
];
