"use client";

import dynamic from "next/dynamic";
import { useProgress } from "@react-three/drei";
import { Diorama } from "@/components/world/Diorama";
import { LiteWorld } from "@/components/world/LiteWorld";
import { CAST } from "@/lib/ui/cast";
import { useCase, useWorld } from "@/lib/state/stores";

const ScoutWorld = dynamic(() => import("@/components/world/ScoutWorld").then((mod) => mod.ScoutWorld), {
  ssr: false,
  loading: () => <Diorama />,
});

export function WorldStage({
  tourIndex = null,
  director = false,
  autoOrbit = false,
}: {
  tourIndex?: number | null;
  director?: boolean;
  autoOrbit?: boolean;
}) {
  const mode = useWorld((state) => state.mode);
  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-[20px] border border-line bg-[#12110e] shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
      {mode === "2d" ? <LiteWorld /> : <ScoutWorld tourIndex={tourIndex} director={director} autoOrbit={autoOrbit} />}
      {mode === "3d" ? <SuitingUp /> : null}
      <ReplayBadge />
      <SelectionNote />
    </div>
  );
}

function SuitingUp() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[#090a0c]/80 backdrop-blur-md">
      <div className="text-center">
        <p className="kicker">Scouts are suiting up</p>
        <p className="num mt-3 text-2xl text-ink">{Math.round(progress)}</p>
      </div>
    </div>
  );
}

function ReplayBadge() {
  const replay = useCase((state) => state.replay);
  const message = useCase((state) => state.replayMessage);
  if (!replay) return null;
  const label = message ?? "Recorded case";
  return <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-line bg-bg/75 px-3 py-1 text-xs text-gold backdrop-blur-md">{label}</div>;
}

function SelectionNote() {
  const selected = useWorld((state) => state.world.selectedCallId);
  const note = useWorld((state) => {
    const actor = state.world.actors.find((item) => item.callId === state.world.selectedCallId);
    if (!actor) return "";
    const cast = CAST[actor.job as keyof typeof CAST] ?? CAST.seeker;
    return `${cast.label} · ${actor.query || cast.role}`;
  });
  if (!selected || !note) return null;
  return <div className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] truncate rounded-full border border-line bg-bg/75 px-3 py-1 text-xs text-ink backdrop-blur-md">{note}</div>;
}
