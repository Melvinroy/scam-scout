import type { IconName } from "@/components/site/icons";

export type Tone = "coral" | "iris" | "tide" | "amber";

export interface Capability {
  title: string;
  line: string;
  icon: IconName;
  tone: Tone;
}

/** Each line names something the live pipeline does today (lib/agent, lib/providers, lib/byok.ts). */
export const SOURCE_TYPES = ["RDAP domain records", "Regulator sites", "Official brand sites", "Open-web search", "Phone number formats"];

export const CAPABILITIES: Capability[] = [
  { title: "Website checks", line: "Reads the domain's registration date from RDAP.", icon: "search", tone: "coral" },
  { title: "Lookalike domains", line: "Flags spellings that copy a known brand's domain.", icon: "mask", tone: "iris" },
  { title: "Phone numbers", line: "Normalises the number with its country code before searching.", icon: "people", tone: "tide" },
  { title: "Regulator searches", line: "Searches regulator sites for warnings that name the subject.", icon: "scale", tone: "amber" },
  { title: "Cited case file", line: "A risk level with every flag linked to the page that raised it.", icon: "file", tone: "iris" },
  { title: "Bring your own keys", line: "Run a check with your own research and model keys.", icon: "key", tone: "tide" },
];
