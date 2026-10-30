"use client";

import { useEffect, useRef, useState } from "react";
import { BYOK_PANEL_COPY } from "@/lib/ui/byok-copy";

const RESEARCH_KEY = "ss_byok_research";
const MODEL_KEY = "ss_byok_model";

const draft = { researchKey: "", modelKey: "" };

/** Blocked storage reads as empty, so a check without own keys still runs. */
function storedKey(name: string): string {
  try {
    return sessionStorage.getItem(name) || "";
  } catch {
    return "";
  }
}

export function readByokDraft(): { researchKey: string; modelKey: string } {
  if (typeof window === "undefined") return { researchKey: "", modelKey: "" };
  return {
    researchKey: draft.researchKey || storedKey(RESEARCH_KEY),
    modelKey: draft.modelKey || storedKey(MODEL_KEY),
  };
}

/** True when the keys were saved for this browser session; false keeps them in memory and in the fields. */
export function persistByokDraft(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (draft.researchKey) sessionStorage.setItem(RESEARCH_KEY, draft.researchKey);
    if (draft.modelKey) sessionStorage.setItem(MODEL_KEY, draft.modelKey);
  } catch {
    // Without storage the keys stay in memory for this page only.
    return false;
  }
  draft.researchKey = "";
  draft.modelKey = "";
  return true;
}

/** Forgets the entered keys, so the next person at this browser cannot use them. */
export function clearByokKeys(): void {
  draft.researchKey = "";
  draft.modelKey = "";
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RESEARCH_KEY);
    sessionStorage.removeItem(MODEL_KEY);
  } catch {
    // Blocked storage holds no keys to forget; signing out must still go ahead.
  }
}

export function ByokSettings() {
  const [research, setResearch] = useState("");
  const [model, setModel] = useState("");
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (window.location.hash === "#advanced" && detailsRef.current) detailsRef.current.open = true;
  }, []);

  useEffect(() => {
    draft.researchKey = research;
    draft.modelKey = model;
  }, [research, model]);

  function remember() {
    if (!persistByokDraft()) return;
    setResearch("");
    setModel("");
  }

  function clearKeys() {
    clearByokKeys();
    setResearch("");
    setModel("");
  }

  return (
    <details id="advanced" ref={detailsRef} className="dossier p-6">
      <summary className="cursor-pointer text-sm text-ink">Use your own keys</summary>
      <div className="mt-4 grid gap-3 text-sm text-muted">
        <p>
          {BYOK_PANEL_COPY}
        </p>
        <label className="grid gap-1">
          Research key
          <input
            type="password"
            autoComplete="off"
            value={research}
            onChange={(event) => setResearch(event.target.value)}
            placeholder="Paste a research key"
            className="field"
          />
        </label>
        <label className="grid gap-1">
          Model key
          <input
            type="password"
            autoComplete="off"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Paste a model key"
            className="field"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={remember} className="btn btn-primary">Use these keys</button>
          <button type="button" onClick={clearKeys} className="btn btn-ghost">Clear keys</button>
        </div>
        <p className="text-xs">Keys are used for your checks.</p>
      </div>
    </details>
  );
}
