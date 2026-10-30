import { redactText } from "@/lib/safety/redact";
import { stripInstructions } from "@/lib/safety/untrusted";

export const ADVISORY_LINE = "Decision support only — not a determination of fraud.";

/**
 * Last pass on text we show or store. Redacts secrets, drops injected instructions,
 * and keeps the verdict in advisory language. This is not a claim of content-moderation certification.
 */
/** Redact secrets and keep model prose in advisory language. Does not add the disclaimer. */
export function sanitizeModelText(input: string): string {
  return stripInstructions(redactText(input).text)
    .replace(/\b(?:is|was|are) a scam\b/gi, "shows scam risk indicators")
    .replace(/\bcommitted fraud\b/gi, "matches fraud risk indicators");
}

export function reviewOutput(markdown: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const redacted = stripInstructions(redactText(markdown).text);
  if (redacted !== markdown) notes.push("redacted");
  const legal = redacted.replace(/\b(?:is|was|are) a scam\b/gi, "shows scam risk indicators").replace(/\bcommitted fraud\b/gi, "matches fraud risk indicators");
  if (legal !== redacted) notes.push("advisory-language");
  let text = legal;
  if (!text.includes("Decision support only")) {
    text = `${text.trim()}\n\n${ADVISORY_LINE}`;
    notes.push("disclaimer");
  }
  return { text, notes };
}
