import { EDGES, WAYPOINTS } from "@/lib/choreo/waypoints";

const ADJACENT = new Map<string, string[]>();
for (const [a, b] of EDGES) {
  ADJACENT.set(a, [...(ADJACENT.get(a) ?? []), b]);
  ADJACENT.set(b, [...(ADJACENT.get(b) ?? []), a]);
}

export function shortestPath(from: string, to: string): string[] {
  if (from === to) return [from];
  if (!WAYPOINTS[from] || !WAYPOINTS[to]) return [from, to].filter((id) => WAYPOINTS[id]);
  const queue = [from];
  const prev = new Map<string, string | null>([[from, null]]);
  while (queue.length) {
    const node = queue.shift() as string;
    if (node === to) break;
    for (const next of ADJACENT.get(node) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      queue.push(next);
    }
  }
  if (!prev.has(to)) return [from];
  const path = [to];
  let cursor: string | null = to;
  while (cursor && cursor !== from) {
    cursor = prev.get(cursor) ?? null;
    if (cursor) path.push(cursor);
  }
  return path.reverse();
}

export function pathPoints(ids: string[]): Array<[number, number, number]> {
  return ids.map((id) => WAYPOINTS[id] ?? WAYPOINTS.hq ?? [0, 0, 0]);
}

export function pathLength(points: Array<[number, number, number]>): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] ?? [0, 0, 0];
    const b = points[i] ?? [0, 0, 0];
    total += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return total;
}

export function pointAlong(points: Array<[number, number, number]>, progress: number): { position: [number, number, number]; facing: number } {
  if (points.length === 0) return { position: [0, 0, 0], facing: 0 };
  const clamped = Math.min(1, Math.max(0, progress));
  const total = pathLength(points);
  if (total === 0) return { position: points[0] ?? [0, 0, 0], facing: 0 };
  let remaining = total * clamped;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] ?? [0, 0, 0];
    const b = points[i] ?? [0, 0, 0];
    const span = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (remaining <= span || i === points.length - 1) {
      const t = span === 0 ? 0 : remaining / span;
      return {
        position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
        facing: Math.atan2(b[0] - a[0], b[2] - a[2]),
      };
    }
    remaining -= span;
  }
  const last = points[points.length - 1] ?? [0, 0, 0];
  return { position: last, facing: 0 };
}
