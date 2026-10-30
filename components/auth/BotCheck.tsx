"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchClientSession } from "@/lib/client/session";

export function BotCheck({ onPassed, onClear }: { onPassed?: () => void; onClear?: () => void }) {
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [widgetRun, setWidgetRun] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const onPassedRef = useRef(onPassed);
  const onClearRef = useRef(onClear);
  const attempt = useRef(0);

  useEffect(() => {
    onPassedRef.current = onPassed;
  }, [onPassed]);

  useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  const [configLookup, setConfigLookup] = useState(0);
  const [configFailed, setConfigFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchClientSession()
      .then((data) => {
        if (cancelled) return;
        setConfigFailed(false);
        setSiteKey((data as { turnstileSiteKey?: string | null }).turnstileSiteKey ?? null);
      })
      // Unknown settings are not "no widget": wait for a retry instead of falling back.
      .catch(() => { if (!cancelled) setConfigFailed(true); });
    return () => { cancelled = true; };
  }, [configLookup]);

  const submit = useCallback(async (token: string) => {
    const id = attempt.current + 1;
    attempt.current = id;
    setStatus("");
    setFailed(false);
    onClearRef.current?.();
    let ok = false;
    try {
      const res = await fetch("/api/human", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (id !== attempt.current) return;
    if (ok) {
      setStatus("This browser can run a live check.");
      onPassedRef.current?.();
      return;
    }
    setStatus("The live check could not start. Try again.");
    setFailed(true);
  }, []);

  useEffect(() => {
    if (!siteKey || !host.current) return;
    const el = host.current;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const fail = () => {
      setStatus("The live check could not start. Try again.");
      setFailed(true);
    };
    el.replaceChildren();
    script.onerror = fail;
    script.onload = () => {
      const turnstile = (window as unknown as {
        turnstile?: { render: (node: HTMLElement, opts: Record<string, unknown>) => void };
      }).turnstile;
      if (!turnstile) return fail();
      turnstile.render(el, {
        sitekey: siteKey,
        callback: (token: string) => {
          void submit(token);
        },
        "error-callback": fail,
        "timeout-callback": fail,
      });
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [siteKey, submit, widgetRun]);

  if (siteKey === undefined && configFailed) {
    return (
      <p className="text-sm text-muted">
        The check could not be prepared. <button type="button" className="link" onClick={() => setConfigLookup((n) => n + 1)}>Try again</button>
      </p>
    );
  }
  if (siteKey === undefined) return <p className="text-sm text-muted">Preparing the check.</p>;

  return (
    <div className="grid gap-2">
      {siteKey ? <div ref={host} /> : (
        <button type="button" onClick={() => void submit("dev")} className="w-fit rounded-full border border-line px-4 py-2 text-sm text-ink">
          Allow a live check
        </button>
      )}
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      {failed && siteKey ? (
        // Retrying is the visitor's choice: an automatic retry would resubmit on every failure. It rebuilds the widget.
        <button type="button" className="link w-fit text-sm" onClick={() => { setFailed(false); setStatus(""); setWidgetRun((n) => n + 1); }}>
          Try the check again
        </button>
      ) : null}
    </div>
  );
}
