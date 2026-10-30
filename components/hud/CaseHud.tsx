"use client";

import { CaseFile } from "@/components/hud/CaseFile";
import { useCase } from "@/lib/state/stores";

export function CaseHud() {
  const view = useCase();
  return (
    <CaseFile
      subject={view.label || view.input}
      status={view.mode === "idle" ? "idle" : view.mode === "done" ? "done" : "running"}
      level={view.verdict?.level}
      score={view.verdict?.score ?? (view.mode === "done" ? view.score : undefined)}
      confidence={view.verdict?.confidence}
      typology={view.verdict?.primary_typology}
      flags={view.flags}
      mitigations={view.mitigations}
      evidence={view.evidence}
      memo={view.memo}
      note={view.error}
      preview
    />
  );
}
