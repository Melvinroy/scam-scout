import { parsePhoneNumberFromString } from "libphonenumber-js";
import { assertPublicHttpUrl } from "@/lib/safety/ssrf";

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SECRET = /\b(?:sk-|tvly-|nvapi-)[A-Za-z0-9_-]{8,}\b/g;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const NRIC = /\b[STFGM]\d{7}[A-Z]\b/gi;
const ACCOUNT = /\b\d{8,17}\b/g;

export function redactText(input: string): { text: string; redactions: number } {
  let redactions = 0;
  const replace = (pattern: RegExp, token: string) => {
    input = input.replace(pattern, () => {
      redactions += 1;
      return token;
    });
  };
  replace(EMAIL, "[email]");
  replace(SECRET, "[key]");
  replace(CARD, "[card]");
  replace(NRIC, "[id]");
  replace(ACCOUNT, "[account]");
  return { text: input, redactions };
}

export function redactContext(input: string): { text: string; redactions: number } {
  const redacted = redactText(input);
  return { text: redacted.text.slice(0, 500), redactions: redacted.redactions };
}

/** A real phone: libphonenumber-valid as typed, or a valid E.164 once a leading + is added. */
export function isAcceptedPhone(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (parsePhoneNumberFromString(trimmed)?.isValid()) return true;
  if (trimmed.startsWith("+")) return false;
  if (!/^[\d\s().-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  return parsePhoneNumberFromString(`+${digits}`)?.isValid() === true;
}

export function looksLikeAccountNumber(raw: string): boolean {
  const value = raw.trim();
  if (!value || /[a-z]/i.test(value)) return false;
  if (!/^[\d\s().+-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 17) return false;
  if (isAcceptedPhone(value)) return false;
  return true;
}

export function looksLikePaymentCard(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function validateIntake(raw: string, context?: string): { ok: true; raw: string; context: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Enter a merchant, website, phone number or payee." };
  if (value.length > 200) return { ok: false, error: "That identifier is too long." };
  if (looksLikePaymentCard(value) || looksLikeAccountNumber(value)) {
    return { ok: false, error: "Account and card numbers are not accepted. Use a name, website or phone number." };
  }
  if (/^https?:\/\//i.test(value) || /^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    try {
      assertPublicHttpUrl(/^https?:\/\//i.test(value) ? value : `http://${value}`);
    } catch {
      return { ok: false, error: "That address is blocked." };
    }
  }
  const redacted = redactContext(context ?? "");
  return { ok: true, raw: value, context: redacted.text };
}
