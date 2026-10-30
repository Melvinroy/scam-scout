export const CAST = {
  seeker: { label: "Seeker", color: "#FFD166", role: "Reports and news", prop: "Magnifier" },
  reader: { label: "Reader", color: "#2EC4B6", role: "Pages from the shop", prop: "Open book" },
  cartographer: { label: "Cartographer", color: "#9B8CFF", role: "Maps and side streets", prop: "Rolled map" },
  inspector: { label: "Inspector", color: "#4DA3FF", role: "Alert lists and registers", prop: "Clipboard" },
  lens: { label: "Lens", color: "#FF7AC6", role: "Looks at the storefront", prop: "Box camera" },
  archivist: { label: "Archivist", color: "#C9A66B", role: "Domain age", prop: "Hourglass" },
  dispatcher: { label: "Dispatcher", color: "#E4C28A", role: "Chooses the next scout", prop: "Pointer" },
  clerk: { label: "Clerk", color: "#E9EEF5", role: "Turns pages into cards", prop: "Stamp pad" },
  chief: { label: "Chief", color: "#F2C66D", role: "Weighs the cards and stamps", prop: "Balance stamp" },
} as const;

export type CastId = keyof typeof CAST;

export const ISLAND_COPY: Record<string, { title: string; note: string }> = {
  hq: { title: "Case desk", note: "Normalize, plan, score, memo" },
  newsstand: { title: "Newsstand", note: "Reports and news the seekers bring home" },
  regulator: { title: "Regulator tower", note: "Alert lists and licence registers" },
  shop: { title: "Merchant shop", note: "Pages the shop itself published" },
  sitemap: { title: "Sitemap city", note: "The map of the site, including odd paths" },
  clones: { title: "Clone isle", note: "Other sites wearing the same fingerprint" },
  photolab: { title: "Photo lab", note: "A look at the storefront" },
  records: { title: "Records hall", note: "How old the domain is" },
};

export function riskColor(level?: string): string {
  if (level === "High") return "#c4233a";
  if (level === "Medium") return "#8a5a00";
  if (level === "Low") return "#0c7a43";
  return "#8b939c";
}

export const TYPOLOGY_LABEL: Record<string, string> = {
  investment_scam: "Investment",
  fake_shop: "Fake shop",
  impersonation: "Impersonation",
  app_mule: "Payment mule",
};
