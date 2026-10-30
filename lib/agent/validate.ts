import type { Evidence, RedFlag } from "@/lib/types";

export function quoteSupported(quote: string | undefined, evidence: Evidence | undefined): boolean {
  if (!quote || !evidence) return false;
  const hay = normalize(evidence.quote);
  const needle = normalize(quote);
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  const quoteTokens = new Set(needle.split(" ").filter((token) => token.length > 3));
  if (quoteTokens.size === 0) return hay.includes(needle);
  let hit = 0;
  for (const token of quoteTokens) {
    if (hay.includes(token)) hit += 1;
  }
  return hit / quoteTokens.size >= 0.9;
}

export function validateFlags(flags: RedFlag[], evidence: Evidence[], quotes: Map<string, string>): { kept: RedFlag[]; dropped: string[] } {
  const byId = new Map(evidence.map((item) => [item.evidence_id, item]));
  const kept: RedFlag[] = [];
  const dropped: string[] = [];
  for (const flag of flags) {
    const idsOk = flag.evidence_ids.every((id) => byId.has(id));
    const quote = quotes.get(flag.signal_id);
    const sample = flag.evidence_ids.map((id) => byId.get(id)).find(Boolean);
    const quoteOk = quote ? quoteSupported(quote, sample) : true;
    if (idsOk && quoteOk) kept.push(flag);
    else dropped.push(flag.signal_id);
  }
  return { kept, dropped };
}

export function validateMemo(markdown: string, evidence: Evidence[]): { markdown: string; ok: boolean; droppedTags: string[] } {
  const ids = new Set(evidence.map((item) => item.evidence_id));
  const tags = [...markdown.matchAll(/\[(ev_[a-z0-9_]+)\]/gi)].map((match) => match[1] ?? "");
  const droppedTags = tags.filter((tag) => !ids.has(tag));
  if (droppedTags.length === 0) return { markdown, ok: true, droppedTags };
  return { markdown: "", ok: false, droppedTags };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
