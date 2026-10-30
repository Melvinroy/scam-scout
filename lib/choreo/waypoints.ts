export const WAYPOINTS: Record<string, [number, number, number]> = {
  hq: [0, 0, 0],
  bridge_n: [0, 0, -3.2],
  bridge_s: [0, 0, 3.15],
  bridge_e: [3.45, 0, 0.15],
  bridge_w: [-3.45, 0, 0.15],
  newsstand: [-7.3, 0, 1.35],
  regulator: [-3.9, 0, -6.5],
  photolab: [4.1, 0, -6.3],
  shop: [7.7, 0, 0.25],
  sitemap: [5.5, 0, 4.9],
  clones: [8.6, 0, 5.9],
  records: [-7.5, 0, 4.9],
};

export const EDGES: Array<[string, string]> = [
  ["hq", "bridge_n"],
  ["hq", "bridge_s"],
  ["hq", "bridge_e"],
  ["hq", "bridge_w"],
  ["bridge_w", "newsstand"],
  ["bridge_n", "regulator"],
  ["bridge_n", "photolab"],
  ["bridge_e", "shop"],
  ["bridge_e", "sitemap"],
  ["sitemap", "clones"],
  ["bridge_s", "records"],
  ["bridge_w", "records"],
  ["bridge_s", "sitemap"],
];

export const ISLANDS = ["hq", "newsstand", "regulator", "photolab", "shop", "sitemap", "clones", "records"] as const;
export type IslandName = (typeof ISLANDS)[number];
