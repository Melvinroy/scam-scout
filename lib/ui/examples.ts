export interface Showcase {
  id: string;
  pattern: string;
  title: string;
  sample: string;
  line: string;
  verdict: "Low" | "Medium" | "High";
}

/** Recorded cases used as the public examples. Inputs match the fixtures. */
export const SHOWCASES: Showcase[] = [
  {
    id: "quantum-yield",
    pattern: "Fake investment platforms",
    title: "Quantum Yield",
    sample: "quantumyield.example",
    line: "A site promising returns, already named on a warning list.",
    verdict: "High",
  },
  {
    id: "bright-parcel",
    pattern: "Clone shops",
    title: "Bright Parcel Deals",
    sample: "brightparcel.example",
    line: "A young shop with a missing refund path and a complaint.",
    verdict: "Medium",
  },
  {
    id: "meridian-alert",
    pattern: "Impersonation",
    title: "Meridian Bank alert",
    sample: "meridian-bank-alert.example",
    line: "A lookalike of a fictional bank, asking you to act now.",
    verdict: "High",
  },
  {
    id: "payee-jordan",
    pattern: "Personal payees",
    title: "Jordan Lee",
    sample: "+65 8123 4409",
    line: "A person asking to be paid, instead of a business.",
    verdict: "Medium",
  },
];

export function showcaseFor(input: string): Showcase | undefined {
  const needle = input.trim().toLowerCase();
  if (!needle) return undefined;
  return SHOWCASES.find((item) => item.sample.toLowerCase() === needle || item.title.toLowerCase() === needle);
}
