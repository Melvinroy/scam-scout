import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getDomain } from "tldts";
import { exactInputIn } from "@/lib/agent/surface";
import { isAcceptedPhone } from "@/lib/safety/redact";
import type { EntityType, NormalizedEntity } from "@/lib/types";

export function tryPhone(raw: string): string | null {
  const trimmed = raw.trim();
  const parsed = parsePhoneNumberFromString(trimmed);
  if (parsed?.isValid()) return parsed.format("E.164");
  if (!isAcceptedPhone(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  const withPlus = parsePhoneNumberFromString(`+${digits}`);
  return withPlus?.isValid() ? withPlus.format("E.164") : null;
}

export function tryDomain(raw: string): { domain: string; url: string } | null {
  const trimmed = raw.trim();
  if (/\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    const domain = getDomain(url.hostname, { validHosts: ["localhost"] }) || url.hostname.toLowerCase();
    if (!domain || domain === "https" || !domain.includes(".")) return null;
    return { domain: domain.toLowerCase(), url: url.toString() };
  } catch {
    return null;
  }
}

function personName(raw: string): boolean {
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(raw.trim());
}

export function normalizeInput(raw: string, context = ""): NormalizedEntity {
  const phone = tryPhone(raw);
  if (phone) {
    const named = context.match(/payee\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    return {
      raw,
      context,
      entity_type: "phone",
      canonical: { phone, names: named ? [named[1]] : [] },
    };
  }
  const domain = tryDomain(raw);
  if (domain) {
    const entity_type: EntityType = /^https?:\/\//i.test(raw) || raw.includes("/") ? "url" : "domain";
    return {
      raw,
      context,
      entity_type,
      canonical: { domain: domain.domain, url: domain.url, names: [] },
    };
  }
  const merchantish = /merchant|shop|store|seller|marketplace|invoice|order/i.test(context);
  const entity_type: EntityType = personName(raw) && merchantish ? "payee" : personName(raw) ? "payee" : "merchant_name";
  return {
    raw,
    context,
    entity_type,
    canonical: { names: [raw.trim()] },
  };
}

export function phoneDigits(phone: string | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function mentionsEntity(text: string, entity: NormalizedEntity): boolean {
  if (entity.canonical.domain && exactInputIn(text, entity)) return true;
  const hay = text.toLowerCase();
  const digits = phoneDigits(entity.canonical.phone);
  if (digits && hay.replace(/\D/g, "").includes(digits.slice(-8))) return true;
  return entity.canonical.names.some((name) => name.length > 3 && hay.includes(name.toLowerCase()));
}
