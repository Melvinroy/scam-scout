import { OFFICIAL } from "@/lib/agent/regulator-data";
import { domainToASCII } from "node:url";
import { officialSiteQueries } from "@/lib/agent/surface";
import type { NormalizedEntity } from "@/lib/types";

export interface RegulatorQuery {
  action: "search_regulator";
  query: string;
  includeDomains: string[];
  depth: "basic";
}

/** The typed input, quoted. A Unicode domain is also searched as punycode. */
export function quotedSubject(entity: NormalizedEntity): string {
  const forms = new Set<string>();
  const add = (value?: string) => {
    const trimmed = value?.trim().replace(/"/g, "");
    if (!trimmed) return;
    forms.add(trimmed);
    if (/\s/.test(trimmed)) return;
    const ascii = domainToASCII(trimmed);
    if (ascii && ascii.toLowerCase() !== trimmed.toLowerCase()) forms.add(ascii);
  };
  add(entity.raw);
  add(entity.canonical.domain);
  if (forms.size === 0) forms.add(entity.raw.trim());
  return [...forms].map((form) => `"${form}"`).join(" OR ");
}

type InputKind = "phone" | "name" | "sg" | "local" | "au" | "domain";

function inputKind(entity: NormalizedEntity): InputKind {
  if (entity.canonical.phone && !entity.canonical.domain) return "phone";
  const host = entity.canonical.domain?.toLowerCase() ?? "";
  if (!host) return "name";
  if (host.endsWith(".sg")) return "sg";
  if (host.endsWith(".au")) return "au";
  if (host.endsWith(".hk") || host.startsWith("xn--") || /[^\u0000-\u007f]/.test(entity.raw)) return "local";
  return "domain";
}

/** Singapore register checks do not need the open-web complaint searches. */
export function skipsOpenWeb(entity: NormalizedEntity): boolean {
  return inputKind(entity) === "sg";
}

function fcaWarnings(quoted: string): RegulatorQuery {
  return {
    action: "search_regulator",
    query: `${quoted} ${OFFICIAL.warningQuery}`,
    includeDomains: [OFFICIAL.warningHost],
    depth: "basic",
  };
}

function masFid(entity: NormalizedEntity): RegulatorQuery {
  const domain = entity.canonical.domain ?? entity.raw;
  const quoted = officialSiteQueries(domain).map((form) => `"${form}"`).join(" OR ");
  return {
    action: "search_regulator",
    query: `${quoted} ${OFFICIAL.profileQuery}`,
    includeDomains: [OFFICIAL.profileHost],
    depth: "basic",
  };
}

/**
 * Warning-list searches chosen for the input. Basic depth is 1 credit.
 * Every name, phone, and domain runs the FCO warnings query.
 * A .sg domain also asks HMA for the FID institution page of that exact host.
 * A Unicode or .hk name checks the government notice hosts in both scripts.
 */
export function regulatorFloorQueries(entity: NormalizedEntity): RegulatorQuery[] {
  const quoted = quotedSubject(entity);
  const kind = inputKind(entity);
  const queries: RegulatorQuery[] = [fcaWarnings(quoted)];
  if (kind === "phone" || kind === "name") return queries;
  if (kind === "sg") {
    queries.push(
      { action: "search_regulator", query: `${quoted} ${OFFICIAL.investorQuery}`, includeDomains: [OFFICIAL.registerHost], depth: "basic" },
      masFid(entity),
      {
        action: "search_regulator",
        query: `${quoted} government scam alert`,
        includeDomains: OFFICIAL.governmentHosts,
        depth: "basic",
      },
    );
    return queries;
  }
  if (kind === "local") {
    queries.push({
      action: "search_regulator",
      query: `${quoted} government scam alert`,
      includeDomains: OFFICIAL.governmentHosts,
      depth: "basic",
    });
    return queries;
  }
  if (kind === "au") {
    queries.push({ action: "search_regulator", query: `${quoted} investor alert`, includeDomains: OFFICIAL.australiaHosts, depth: "basic" });
    return queries;
  }
  queries.push(
    { action: "search_regulator", query: `${quoted} investor alert`, includeDomains: OFFICIAL.securitiesHosts, depth: "basic" },
    { action: "search_regulator", query: `${quoted} ${OFFICIAL.redListQuery}`, includeDomains: OFFICIAL.redListHosts, depth: "basic" },
  );
  return queries;
}
