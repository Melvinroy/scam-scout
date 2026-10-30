export interface BrandDomain {
  name: string;
  domain: string;
}

/** Comparison strings only. No logos are drawn or shipped. */
export const BRAND_DOMAINS: BrandDomain[] = [
  { name: "Meridian Bank", domain: "meridianbank.example" },
  { name: "Helios Remit", domain: "heliosremit.example" },
  { name: "PayPal", domain: "paypal.com" },
  { name: "Amazon", domain: "amazon.com" },
  { name: "Apple", domain: "apple.com" },
  { name: "Google", domain: "google.com" },
  { name: "Microsoft", domain: "microsoft.com" },
];

const SUFFIXES = ["alert", "secure", "login", "support", "verify", "account", "online", "update", "service", "notice", "security", "helpdesk", "signin"];

export function registrableSlug(domain: string): string {
  const host = domain.toLowerCase().replace(/^www\./, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return canon(host);
  return canon(parts[parts.length - 2] ?? host);
}

export function canon(value: string): string {
  return value
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/\$/g, "s");
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((row[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length] ?? 99;
}

export function lookalikeOf(domain: string, brands: BrandDomain[] = BRAND_DOMAINS): BrandDomain | null {
  const slug = registrableSlug(domain);
  for (const brand of brands) {
    const official = registrableSlug(brand.domain);
    if (domain.toLowerCase() === brand.domain.toLowerCase()) continue;
    if (!official || official.length < 5) continue;
    if (slug === official) return brand;
    if (slug.startsWith(official) && SUFFIXES.includes(slug.slice(official.length))) return brand;
    if (levenshtein(slug, official) <= 2) return brand;
  }
  return null;
}

export function isOfficialBrand(domain: string, brands: BrandDomain[] = BRAND_DOMAINS): BrandDomain | null {
  return brands.find((brand) => brand.domain.toLowerCase() === domain.toLowerCase()) ?? null;
}
