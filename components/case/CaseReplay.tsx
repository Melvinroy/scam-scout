"use client";

import { useEffect } from "react";
import { WorldStage } from "@/components/world/WorldStage";
import { createEventPump } from "@/lib/client/pump";
import { publishEvent, resetInvestigation } from "@/lib/state/stores";
import type { AgentEvent } from "@/lib/types";

export function CaseReplay({ id }: { id: string }) {
  useEffect(() => {
    const pump = createEventPump(publishEvent);
    let cancelled = false;
    resetInvestigation();
    void (async () => {
      const res = await fetch(`/api/replays/${id}`);
      if (!res.ok || cancelled) return;
      const pack = (await res.json()) as { events?: AgentEvent[] };
      for (const event of pack.events ?? []) pump.push(event);
    })();
    return () => {
      cancelled = true;
      pump.stop();
    };
  }, [id]);

  return (
    <div className="h-[min(68vh,620px)] min-h-[420px]">
      <WorldStage director />
    </div>
  );
}
