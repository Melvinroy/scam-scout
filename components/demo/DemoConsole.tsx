"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { fetchClientSession } from "@/lib/client/session";
import { BotCheck } from "@/components/auth/BotCheck";
import { ByokSettings, persistByokDraft, readByokDraft } from "@/components/demo/ByokSettings";
import { LiveSheet } from "@/components/hud/LiveSheet";
import { generationStillCurrent, recordedReplayMayStart } from "@/lib/client/demo-guard";
import { createEventPump, readSse } from "@/lib/client/pump";
import { beginLiveCheck, publishEvent, publishFinishedReport, resetInvestigation } from "@/lib/state/stores";
import type { AgentEvent, CaseReport, VerdictLevel } from "@/lib/types";

export interface PresetCard {
  id: string;
  label: string;
  blurb: string;
  input: string;
  expected: { verdict: VerdictLevel; typology: string | null };
}

const LIVE_FAILED = "The live check could not start. Try again.";
const LIVE_STOPPED = "The check stopped before a case file was ready. Recorded examples still play.";
const REPLAY_FAILED = "That recorded case could not be loaded.";

type ReplayPack = { events?: AgentEvent[]; input?: string };

/** A refused, unreachable or unreadable recording all come back as null. */
async function loadReplay(id: string): Promise<ReplayPack | null> {
  try {
    const res = await fetch(`/api/replays/${id}`);
    if (!res.ok) return null;
    const pack = (await res.json()) as ReplayPack | null;
    return pack && typeof pack === "object" ? pack : null;
  } catch {
    return null;
  }
}

export function DemoConsole({
  presets,
  initialId,
  initialInput = "",
  openingReplay,
  availabilityMessage = null,
}: {
  presets: PresetCard[];
  initialId: string;
  initialInput?: string;
  openingReplay: boolean;
  availabilityMessage?: string | null;
}) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [active, setActive] = useState(initialId);
  const [input, setInput] = useState(initialInput);
  const [context, setContext] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState("");
  const [needsInvite, setNeedsInvite] = useState(false);
  const [captureJson, setCaptureJson] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [fieldReady, setFieldReady] = useState(!openingReplay);
  const pumpRef = useRef<ReturnType<typeof createEventPump> | null>(null);
  const generation = useRef(0);
  const runningRef = useRef(false);
  const liveRequest = useRef<AbortController | null>(null);
  const inputRef = useRef(input);

  const [sessionFailed, setSessionFailed] = useState(false);
  const [sessionLookup, setSessionLookup] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchClientSession()
      .then((session) => {
        if (cancelled) return;
        setSessionFailed(false);
        setSignedIn(Boolean(session.user));
      })
      // An unreadable session is unknown, not signed out: offer a retry instead of a sign-in prompt.
      .catch(() => { if (!cancelled) setSessionFailed(true); });
    return () => { cancelled = true; };
  }, [sessionLookup]);

  const startPump = useCallback((events: AgentEvent[]) => {
    pumpRef.current?.stop();
    resetInvestigation();
    const pump = createEventPump(publishEvent);
    pumpRef.current = pump;
    for (const event of events) pump.push(event);
  }, []);

  const play = useCallback(async (id: string) => {
    if (runningRef.current) return;
    generation.current += 1;
    const started = generation.current;
    // Clear the old recording first, so a slow or failed load never shows it under the new choice.
    pumpRef.current?.stop();
    resetInvestigation();
    setActive(id);
    setNotice(null);
    setNeedsInvite(false);
    setCaptureJson(null);
    const preset = presets.find((item) => item.id === id);
    if (preset) {
      inputRef.current = preset.input;
      setInput(preset.input);
    }
    const pack = await loadReplay(id);
    if (!generationStillCurrent(started, generation.current)) return;
    if (!pack) {
      setNotice(REPLAY_FAILED);
      return;
    }
    if (pack.input) {
      inputRef.current = pack.input;
      setInput(pack.input);
    }
    startPump(pack.events ?? []);
  }, [presets, startPump]);

  // Leaving /demo stops any playback and invalidates pending loads, so nothing publishes into the shared store later.
  useEffect(() => () => {
    generation.current += 1;
    pumpRef.current?.stop();
    liveRequest.current?.abort();
  }, []);

  useEffect(() => {
    if (!openingReplay) {
      // The shared case store outlives client navigation, so a fresh opening clears the last result.
      resetInvestigation();
      return;
    }
    const started = generation.current;
    let cancelled = false;
    // Clear what an earlier visit left in the shared store before loading, so a failure shows nothing stale.
    pumpRef.current?.stop();
    resetInvestigation();
    void (async () => {
      const pack = await loadReplay(initialId);
      if (cancelled || !generationStillCurrent(started, generation.current)) return;
      if (!pack) {
        setFieldReady(true);
        setNotice(REPLAY_FAILED);
        return;
      }
      if (cancelled || !generationStillCurrent(started, generation.current) || !recordedReplayMayStart(inputRef.current, runningRef.current, initialInput, openingReplay)) return;
      setFieldReady(true);
      startPump(pack.events ?? []);
    })();
    return () => {
      cancelled = true;
      if (generationStillCurrent(started, generation.current)) pumpRef.current?.stop();
    };
  }, [initialId, initialInput, openingReplay, startPump]);

  async function investigate(event: FormEvent) {
    event.preventDefault();
    if (runningRef.current || signedIn !== true) return;
    setNotice(null);
    setCaptureJson(null);
    persistByokDraft();
    const keys = readByokDraft();
    if (Boolean(keys.researchKey) !== Boolean(keys.modelKey)) {
      setNotice("Advanced needs both a research key and a model key.");
      return;
    }
    generation.current += 1;
    const started = generation.current;
    const controller = new AbortController();
    liveRequest.current = controller;
    runningRef.current = true;
    setRunning(true);
    pumpRef.current?.stop();
    beginLiveCheck(input);
    const pump = createEventPump(publishEvent);
    pumpRef.current = pump;
    const usingKeys = Boolean(keys.researchKey && keys.modelKey);
    let res: Response;
    try {
      res = await fetch("/api/cases", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          live: true,
          input,
          context,
          ...(usingKeys ? { researchKey: keys.researchKey, modelKey: keys.modelKey } : {}),
        }),
      });
    } catch {
      if (!generationStillCurrent(started, generation.current)) return;
      // A network failure must not leave the form stuck in the running state.
      setNotice(LIVE_FAILED);
      resetInvestigation();
      runningRef.current = false;
      setRunning(false);
      return;
    }
    if (!generationStillCurrent(started, generation.current)) return;
    if (!res.ok) {
      // Server statuses are codes, not copy, so every refusal reads the same.
      setNotice(LIVE_FAILED);
      setNeedsInvite(res.status === 402);
      resetInvestigation();
      runningRef.current = false;
      setRunning(false);
      return;
    }
    setNeedsInvite(false);
    setActive("");
    let finished = false;
    try {
      await readSse(res, (item) => {
        // A newer check or leaving the page owns the shared store now.
        if (!generationStillCurrent(started, generation.current)) return;
        if (item.type === "capture.saved") {
          const capture = item.payload.capture as { report?: CaseReport } | undefined;
          if (capture) setCaptureJson(JSON.stringify(capture, null, 2));
          if (capture?.report) {
            finished = true;
            publishFinishedReport(capture.report);
          }
          return;
        }
        if (item.type === "case.done") finished = true;
        pump.push(item);
      });
      if (!finished) throw new Error("stream_ended_early");
    } catch {
      if (generationStillCurrent(started, generation.current)) {
        pump.stop();
        resetInvestigation();
        setNotice(LIVE_STOPPED);
      }
    } finally {
      if (generationStillCurrent(started, generation.current)) {
        runningRef.current = false;
        setRunning(false);
      }
    }
  }

  async function redeem(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (redeeming) return;
    setRedeeming(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: invite }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setNotice(json.ok ? "Done." : json.error || "That code was not accepted.");
      if (json.ok) setNeedsInvite(false);
    } catch {
      setNotice("That did not go through. Try again.");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-[1200px] items-start gap-12 px-6 py-14 lg:grid-cols-2 lg:gap-12 lg:py-16">
      <div className="min-w-0">
        <p className="kicker">Live check</p>
        <h1 className="page-title mt-3">Run a check.</h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
          Examples play a recorded case.
        </p>
        {sessionFailed && signedIn === null ? <p className="invite-note" data-availability="true">We could not check your sign-in. <button type="button" className="link" onClick={() => setSessionLookup((n) => n + 1)}>Try again</button></p> : signedIn === false ? <p className="invite-note" data-availability="true"><Link href="/sign-in" className="link">Sign in to run a live check</Link></p> : signedIn === true && availabilityMessage ? <p className="invite-note" data-availability="true">{availabilityMessage}</p> : signedIn === true ? <p className="live-note" data-live-note="true">Live checks are on.</p> : null}
        <form id="check" onSubmit={(event) => void investigate(event)} className="mt-8 grid gap-3">
          <label className="field-label" htmlFor="live-check">Website, phone or payee</label>
          <input
            id="live-check"
            value={input}
            onChange={(event) => {
              inputRef.current = event.target.value;
              setInput(event.target.value);
            }}
            placeholder="Website, phone or payee"
            className="field-input"
            data-opening={fieldReady ? "settled" : "pending"}
            required
          />
          <label className="field-label" htmlFor="live-context">What you were told (optional)</label>
          <textarea
            id="live-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="What you were told (optional)"
            className="field-input"
          />
          <BotCheck onClear={() => setNotice(null)} />
          <button type="submit" className="btn btn-primary w-fit" disabled={running || signedIn !== true} aria-busy={running} data-running={running ? "true" : "false"}>
            {running ? "Checking…" : "Run a live check"}
          </button>
          {running ? <p className="invite-note" data-live-running="true">Checking now. The result will show on this page.</p> : null}
          {notice ? <p className="text-sm text-muted">{notice}</p> : null}
          {captureJson ? (
            <button type="button" className="btn btn-ghost w-fit" onClick={() => downloadCapture(captureJson)}>
              Download capture JSON
            </button>
          ) : null}
          {needsInvite ? (
            <div className="flex flex-wrap gap-2">
              <input
                value={invite}
                onChange={(event) => setInvite(event.target.value)}
                // Enter here redeems the code; it must not submit the surrounding check form.
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void redeem(event); } }}
                placeholder="Access code"
                aria-label="Access code"
                className="field-input max-w-48"
              />
              <button type="button" onClick={(event) => void redeem(event)} className="btn btn-ghost" disabled={redeeming} aria-busy={redeeming}>Continue</button>
            </div>
          ) : null}
        </form>
        <div className="mt-6 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => void play(preset.id)}
              className="chip"
              data-on={active === preset.id}
            >
              <span>{preset.label}</span>
              <span className="ml-2">{preset.expected.verdict}</span>
            </button>
          ))}
        </div>
        <div className="mt-10">
          <ByokSettings />
        </div>
      </div>
      <div className="min-w-0 lg:sticky lg:top-24">
        <LiveSheet />
      </div>
    </main>
  );
}

function downloadCapture(json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "capture.json";
  link.click();
  URL.revokeObjectURL(url);
}
