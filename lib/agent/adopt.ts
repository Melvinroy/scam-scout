import { isRegulatorHost } from "@/lib/agent/detect";
import { plainText } from "@/lib/agent/surface";
import type { NormalizedEntity } from "@/lib/types";

const BLOCKED = /(^|\.)(forum|victims|reviews|guide|news|alerts|register)\.example$/;

export interface DomainSource {
  title: string;
  text: string;
}

/**
 * A domain is adopted only when one non-regulator host sits next to the exact
 * entity name. A list page that names several domains adopts none of them.
 */
export function adoptedDomain(observations: DomainSource[], entity: NormalizedEntity): string | null {
  const labels = mentionLabels(entity);
  if (!labels.length) return null;
  const found = new Set<string>();
  for (const item of observations) {
    const hay = plainText(`${item.title}\n${item.text}`).toLowerCase();
    const fromPage = new Set<string>();
    for (const label of labels) {
      let from = 0;
      while (from < hay.length) {
        const at = hay.indexOf(label, from);
        if (at < 0) break;
        const window = hay.slice(Math.max(0, at - 120), Math.min(hay.length, at + label.length + 120));
        const near = domainsIn(window);
        if (near.length === 1 && near[0]) fromPage.add(near[0]);
        from = at + Math.max(1, label.length);
      }
    }
    if (fromPage.size === 1) {
      const only = [...fromPage][0];
      if (only) found.add(only);
    }
  }
  if (found.size !== 1) return null;
  return [...found][0] ?? null;
}

function mentionLabels(entity: NormalizedEntity): string[] {
  const names = entity.canonical.names
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 3);
  const bare = names.map((name) => name.replace(/^(the|a|an)\s+/, "").trim()).filter((name) => name.length > 3);
  const raw = entity.raw.trim().toLowerCase();
  const all = raw.length > 3 ? [raw, ...names, ...bare] : [...names, ...bare];
  return [...new Set(all)];
}

function domainsIn(window: string): string[] {
  const found = new Set<string>();
  for (const match of window.match(/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)+/gi) ?? []) {
    const domain = match.toLowerCase().replace(/^www\./, "");
    if (BLOCKED.test(domain) || isRegulatorHost(domain)) continue;
    if (domain.endsWith(".gov") || domain.endsWith(".gov.uk") || domain.endsWith(".gov.sg") || domain.endsWith(".gov.hk")) continue;
    found.add(domain);
  }
  return [...found];
}
