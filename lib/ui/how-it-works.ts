export interface HowStep {
  id: string;
  kicker: string;
  title: string;
  body: string;
  color: string;
}

/** The home-page path. Vendor names belong in HOW_CREDIT, not in these steps. */
export const HOW_STEPS: HowStep[] = [
  {
    id: "paste",
    kicker: "Start",
    title: "Paste a link or a number",
    body: "A website, a phone, or a payee. The check starts there.",
    color: "#ff5a36",
  },
  {
    id: "scouts",
    kicker: "Scouts",
    title: "Scouts search public sources",
    body: "Warning lists, domain records, news, and the page itself. No quote, no flag.",
    color: "#4f46e5",
  },
  {
    id: "cross-check",
    kicker: "Cross-check",
    title: "Evidence is cross-checked",
    body: "A memo can be drafted. A flag the sources do not support is dropped.",
    color: "#0c8f7d",
  },
  {
    id: "verdict",
    kicker: "Case file",
    title: "Case file verdict",
    body: "A score, the signals, and the sources. Advice only. Not a fraud finding.",
    color: "#c4233a",
  },
];

export const HOW_CREDIT = "Built with web research and open models.";
