export interface TrustBound {
  id: string;
  title: string;
  line: string;
  color: string;
}

/** What a case file promises. Neutral on purpose: no internal controls, limits or providers. */
export const TRUST_BAND: TrustBound[] = [
  {
    id: "evidence",
    title: "Evidence",
    line: "Every flag links to the page that raised it. A flag without a matching quote is dropped.",
    color: "#0c8f7d",
  },
  {
    id: "recorded",
    title: "Recorded cases",
    line: "Recorded cases show the full method, with no account needed.",
    color: "#4f46e5",
  },
  {
    id: "intake",
    title: "Private details",
    line: "Account and card numbers are not accepted. Check a website, phone or payee name.",
    color: "#c4233a",
  },
  {
    id: "advisory",
    title: "Advisory",
    line: "Advice only. The payment decision stays with the person.",
    color: "#b45309",
  },
];
