/**
 * Worst-case Tavily credits for each call exactly as lib/providers/live.ts sends it, from
 * Tavily's published pricing. Both the lifetime ledger and the per-check cap reserve these
 * before the call, so a settled count can never pass a cap.
 * search: basic 1, advanced 2. extract (basic): 1 per 5 URLs.
 * map (limit 40, no instructions): 1 per 10 pages = 4.
 * crawl (limit 10, with instructions, basic extract): mapping 2 per 10 pages + extract 2 = 4.
 */
export const TAVILY_WORST = {
  search: (depth: string) => (depth === "advanced" ? 2 : 1),
  extract: (urls: number) => Math.max(1, Math.ceil(urls / 5)),
  map: 4,
  crawl: 4,
} as const;
