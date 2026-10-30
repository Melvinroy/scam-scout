"use client";

import { useEffect } from "react";
import { createEventPump } from "@/lib/client/pump";
import { publishEvent, resetInvestigation } from "@/lib/state/stores";
import type { AgentEvent } from "@/lib/types";

/** Play a recorded case into the case file. Does not mount the 3D world. */
export function useReplay(id: string | null) {
  useEffect(() => {
    if (!id) return;
    const pump = createEventPump(publishEvent);
    let cancelled = false;
    resetInvestigation();
    void (async () => {
      const res = await fetch(`/api/replays/${id}`);
      if (!res.ok || cancelled) return;
      const pack = (await res.json()) as { events?: AgentEvent[] };
      if (cancelled) return;
      for (const event of pack.events ?? []) pump.push(event);
    })();
    return () => {
      cancelled = true;
      pump.stop();
    };
  }, [id]);
}
