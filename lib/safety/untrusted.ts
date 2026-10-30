import { redactText } from "@/lib/safety/redact";

const INJECTION = /ignore (?:all |any )?previous instructions|ignore all previous|disregard (?:all |the )?(?:above|previous)|you are now|system prompt|<\s*\/?\s*(?:system|instructions)\s*>|do not follow the (?:above|previous)|developer message/gi;

/** Remove instruction-shaped phrases. The surrounding words stay, so a citation can still be checked. */
export function stripInstructions(input: string): string {
  return input.replace(INJECTION, "[stripped]");
}

/**
 * Web pages and user notes are data. Redact secrets and card-shaped numbers, and wrap
 * the JSON so a model is told not to follow it. The page wording itself stays intact.
 */
export function isolateUntrusted(value: unknown): string {
  const json = JSON.stringify(value, (_key, item) => (typeof item === "string" ? redactText(item).text : item));
  return `<data>\n${json}\n</data>`;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Keep only listed fields, and only when they have the expected JSON type. */
export function pickFields(value: unknown, fields: Record<string, "string" | "number" | "boolean" | "string[]">): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  const next: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(fields)) {
    const item = record[key];
    if (kind === "string[]") {
      if (!Array.isArray(item) || item.some((entry) => typeof entry !== "string")) return null;
      next[key] = item;
      continue;
    }
    if (typeof item !== kind) return null;
    next[key] = item;
  }
  return next;
}
