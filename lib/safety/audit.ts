import { redactText } from "@/lib/safety/redact";

export interface AuditRecord {
  ts: string;
  caseId: string;
  mode: string;
  verdict: string;
  subject: string;
}

const PHONE_TOKEN = /(?:\+\d[\d\s().-]{6,}\d|\b\d[\d\s().-]{6,}\d\b)/g;

/** A subject safe to keep in an audit row: no keys, no full phone, no card. */
export function auditSubject(raw: string): string {
  const cleaned = redactText(raw).text.replace(PHONE_TOKEN, (token) => {
    const digits = token.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return token;
    return `phone …${digits.slice(-2)}`;
  });
  return cleaned.trim().slice(0, 120);
}
