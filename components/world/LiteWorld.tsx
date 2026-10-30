"use client";

import { WAYPOINTS, ISLANDS } from "@/lib/choreo/waypoints";
import { CAST } from "@/lib/ui/cast";
import { useWorld } from "@/lib/state/stores";

const ISLAND_LABEL: Record<string, string> = {
  hq: "Desk",
  newsstand: "News",
  regulator: "Alerts",
  photolab: "Photo",
  shop: "Shop",
  sitemap: "Map",
  clones: "Copies",
  records: "Age",
};

export function LiteWorld() {
  const actors = useWorld((state) => state.world.actors);
  const stamp = useWorld((state) => state.world.stamp);
  return (
    <div className="relative h-full min-h-[420px] overflow-hidden bg-[#071018]" aria-label="Scout World lite">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <rect width="100" height="100" fill="#071018" />
      </svg>
      {ISLANDS.map((id) => {
        const point = WAYPOINTS[id] ?? [0, 0, 0];
        const spot = project(point[0], point[2]);
        return (
          <div key={id} className="absolute -translate-x-1/2 -translate-y-1/2" style={spot}>
            <div className="h-10 w-16 rotate-45 rounded-sm bg-[#1b3148]" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] tracking-wide text-lantern">
              {ISLAND_LABEL[id] ?? id}
            </span>
          </div>
        );
      })}
      {actors.map((actor) => {
        const cast = CAST[actor.job as keyof typeof CAST] ?? CAST.seeker;
        const spot = project(actor.position[0], actor.position[2]);
        return (
          <button
            key={actor.callId}
            type="button"
            className="absolute z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40"
            style={{ ...spot, background: cast.color }}
            title={`${cast.label}: ${actor.query}`}
            onClick={() => useWorld.getState().select(actor.callId)}
          />
        );
      })}
      {stamp ? (
        <div className="absolute bottom-4 right-4 rounded-full border border-white/20 px-3 py-1 text-xs tracking-[0.2em]" style={{ color: stamp === "High" ? "#FF4D6D" : stamp === "Medium" ? "#FFB547" : "#2BD99F" }}>
          {stamp}
        </div>
      ) : null}
    </div>
  );
}

function project(x: number, z: number): { left: string; top: string } {
  return {
    left: `${((x + 9) / 19) * 100}%`,
    top: `${((z + 8) / 16) * 100}%`,
  };
}
