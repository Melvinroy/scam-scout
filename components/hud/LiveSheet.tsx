"use client";

import { CountUp } from "@/components/ui/CountUp";
import Link from "next/link";
import { useCase } from "@/lib/state/stores";
import { sheetColor, sheetFromView, type SheetSlice, type SheetTone } from "@/lib/ui/live-sheet";

const TONE: Record<SheetTone, string> = {
  adverse: "#c4233a",
  caution: "#b45309",
  unknown: "#8b939c",
};

/** The live case, in the same sheet as the recorded How it works result. */
export function LiveSheet() {
  const view = useCase();
  const sheet = sheetFromView(view);
  const color = sheetColor(sheet);

  return (
    <article className="dash dash-live" aria-live="polite" aria-label={`Case file for ${sheet.subject}`}>
      <header className="dash-head">
        <Gauge key={sheet.subject} score={sheet.score} color={color} />
        <div className="min-w-0">
          <p className={sheet.unverified ? "stamp stamp-literal text-sm" : "stamp text-sm"} style={{ color: sheet.unverified || !sheet.level ? "var(--color-ink)" : color }}>{sheet.stamp}</p>
          <h2 className="dash-subject">{sheet.subject}</h2>
          {sheet.sample ? <p className="dash-sample">{sheet.sample}</p> : null}
          <p className="dash-disclaimer">Advice only. Not a fraud finding.</p>
          {sheet.chips.length ? (
            <div className="dash-chips">
              {sheet.chips.map((chip) => (
                <span key={chip} className="dash-chip">{chip}</span>
              ))}
            </div>
          ) : null}
          {sheet.error ? <p className="dash-finding">{sheet.error}</p> : null}
        </div>
      </header>
      {sheet.mix.length ? <Mix parts={sheet.mix} /> : null}
      {sheet.signals.length ? (
        <ul className="dash-signals">
          {sheet.signals.map((signal) => (
            <li key={signal.id} className="dash-signal" data-tone={signal.tone} style={{ ["--tone" as string]: TONE[signal.tone] }}>
              <div className="dash-signal-top">
                <span className="dash-signal-label">{signal.label}</span>
                {signal.points > 0 ? <CountUp className="dash-points num" value={signal.points} /> : <span className="dash-pill" data-tone="unknown">{signal.points < 0 ? "Lowers risk" : "No change"}</span>}
              </div>
              <span className="dash-bar" aria-hidden>
                <span style={{ width: `${signal.width}%` }} />
              </span>
              {signal.finding ? <p className="dash-finding">{signal.finding}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {sheet.sources.length ? (
        <ul className="dash-sources">
          {sheet.sources.map((source) => (
            <li key={source.id} className="dash-source" data-tone={source.tone} style={{ ["--tone" as string]: TONE[source.tone] }}>
              <div className="dash-signal-top">
                <span className="dash-signal-label">{source.label}</span>
                <span className="dash-pill" data-tone={source.tone}>{source.kind}</span>
              </div>
              <blockquote className="dash-quote">{source.quote}</blockquote>
              {source.url ? (
                <Link href={`/leaving?url=${encodeURIComponent(source.url)}`} className="link text-sm text-iris">
                  {source.source}
                </Link>
              ) : (
                <p className="dash-finding">{source.source}</p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {sheet.memo.length ? (
        <details className="dash-memo">
          <summary>Full memo</summary>
          {sheet.memo.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </details>
      ) : null}
    </article>
  );
}

function Gauge({ score, color }: { score: number | null; color: string }) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const arc = circ * 0.72;
  const rest = score == null ? arc : arc - arc * (score / 100);
  return (
    <div className="dash-gauge">
      <svg viewBox="0 0 120 104" aria-hidden>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(28,23,51,0.08)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${arc} ${circ}`} transform="rotate(140 60 60)" />
        <circle className="gauge-arc gauge-follow" cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${arc} ${circ}`} transform="rotate(140 60 60)" style={{ ["--gauge-from" as string]: String(arc), ["--gauge-to" as string]: String(rest), strokeDashoffset: rest }} />
      </svg>
      <div className="dash-gauge-num">
        {score == null ? <span className="num" style={{ color: "var(--color-ink)" }}>–</span> : <CountUp accessibleLabel={`Risk score: ${score} of 100`} className="num" style={{ color: color === TONE.unknown ? "var(--color-ink)" : color }} value={score} />}
        <span>Advisory</span>
      </div>
    </div>
  );
}

function Mix({ parts }: { parts: SheetSlice[] }) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const arcs = parts.reduce<Array<SheetSlice & { len: number; offset: number }>>((list, part) => {
    const offset = list.reduce((sum, arc) => sum + arc.len, 0);
    const len = (Math.max(0, part.points) / 100) * circ;
    return [...list, { ...part, len, offset }];
  }, []);
  return (
    <div className="dash-mix">
      <svg viewBox="0 0 72 72" aria-hidden>
        {arcs.map((arc) => (
          <circle
            key={arc.id}
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth="9"
            strokeDasharray={`${Math.max(0, arc.len - 1.5)} ${circ}`}
            strokeDashoffset={-arc.offset}
            transform="rotate(-90 36 36)"
            className="mix-arc"
            style={{ ["--mix-len" as string]: String(Math.max(0, arc.len - 1.5)), ["--mix-circ" as string]: String(circ) }}
          />
        ))}
      </svg>
      <ul>
        {parts.map((part) => (
          <li key={part.id}>
            <i style={{ background: part.color }} />
            <span>{part.label}</span>
            <CountUp className="num" value={part.points} />
          </li>
        ))}
      </ul>
    </div>
  );
}
