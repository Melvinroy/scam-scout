"use client";

import { CountUp } from "@/components/ui/CountUp";
import { useState, type FormEvent } from "react";
import { HOW_CREDIT, HOW_STEPS } from "@/lib/ui/how-it-works";
import { ILLUSTRATIVE_LABEL, levelOf, publicCaseById, publicCaseFor, scoreOf, type PublicCase, type Tone } from "@/lib/ui/public-evidence";

const TONE: Record<Tone, string> = {
  adverse: "#c4233a",
  caution: "#b45309",
  unknown: "#8b939c",
};

const STATUS: Record<Tone, string> = {
  adverse: "Adverse",
  caution: "Caution",
  unknown: "Not cited",
};

/** Caps from the published advisory weights. A zero cap has no cited scale. */
const CAP: Record<PublicCase["tiles"][number]["id"], number> = {
  regulator: 40,
  contact: 20,
  domain: 10,
  reviews: 10,
  payment: 0,
  site: 15,
};

export function HowItWorks({
  caseId: caseIdProp,
  onCaseId,
}: {
  caseId?: string;
  onCaseId?: (id: string) => void;
}) {
  const initial = publicCaseById("quarnby-investment-bank");
  const [localId, setLocalId] = useState(initial.id);
  const [query, setQuery] = useState(initial.sample);
  const [note, setNote] = useState("");
  const caseId = caseIdProp ?? localId;
  const [seen, setSeen] = useState(caseId);
  if (caseId !== seen) {
    setSeen(caseId);
    setQuery(publicCaseById(caseId).sample);
    setNote("");
  }
  const item = publicCaseById(caseId);

  function chooseCase(id: string) {
    setLocalId(id);
    onCaseId?.(id);
    setQuery(publicCaseById(id).sample);
    setNote("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const known = publicCaseFor(query);
    if (known) {
      chooseCase(known.id);
      return;
    }
    setNote("Showing the recorded case. This page does not run a live check.");
  }

  return (
    <section id="how-it-works" className="how-sheet" aria-labelledby="how-title">
      <div className="how-wrap">
        <p className="kicker">How it works</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h2 id="how-title" className="how-title">From a link to a case file.</h2>
        </div>
        <form className="check-bar mt-6" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="how-check">Number, email, or link</label>
          <input
            id="how-check"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Number, email, or link"
            className="check-input"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary check-go shrink-0">Check</button>
        </form>
        {note ? <p className="how-note" role="status">{note}</p> : null}
        <ol className="how-moves">
          {HOW_STEPS.map((step) => (
            <li key={step.id} className="how-move" style={{ ["--tone" as string]: step.color }}>
              <span className="how-kicker">{step.kicker}</span>
              <span className="how-name">{step.title}</span>
              <span className="how-body">{step.body}</span>
            </li>
          ))}
        </ol>
        <Result key={item.id} item={item} />
        <p className="how-credit">{HOW_CREDIT}</p>
      </div>
    </section>
  );
}

function Result({ item }: { item: PublicCase }) {
  const score = scoreOf(item);
  const level = levelOf(score);
  const color = level === "High" ? TONE.adverse : level === "Medium" ? TONE.caution : "#0c7a43";
  return (
    <article className="dash" aria-label={`Recorded result for ${item.subject}`}>
      <header className="dash-head">
        <Gauge score={score} color={color} />
        <div className="min-w-0">
          <p className="stamp text-sm" style={{ color }}>{level} risk</p>
          <h3 className="dash-subject">{item.subject}</h3>
          <p className="dash-sample">{item.sample}</p>
          <p className="dash-disclaimer">Advice only. Not a fraud finding.</p>
          <div className="dash-chips">
            <span className="dash-chip">{item.line}</span>
            <span className="dash-chip">{ILLUSTRATIVE_LABEL}</span>
          </div>
        </div>
        <Mix item={item} score={score} />
      </header>
      <ul className="dash-signals">
        {item.tiles.map((tile) => {
          const cap = CAP[tile.id];
          const width = cap > 0 ? Math.round((tile.points / cap) * 100) : 0;
          return (
            <li key={tile.id} className="dash-signal" data-tone={tile.tone} style={{ ["--tone" as string]: TONE[tile.tone] }}>
              <div className="dash-signal-top">
                <span className="dash-signal-label">{tile.label}</span>
                <span className="dash-pill" data-tone={tile.tone}>{STATUS[tile.tone]}</span>
                <CountUp className="dash-points num" value={tile.points} />
              </div>
              <span className="dash-bar" aria-hidden>
                <span style={{ width: `${width}%` }} />
              </span>
              <p className="dash-finding">{tile.finding}</p>
            </li>
          );
        })}
      </ul>
      <ul className="dash-sources">
        {item.nodes.map((node) => (
          <li key={node.id} className="dash-source" data-tone={node.tone} style={{ ["--tone" as string]: TONE[node.tone] }}>
            <div className="dash-signal-top">
              <span className="dash-signal-label">{node.label}</span>
              <span className="dash-pill" data-tone={node.tone}>{node.kind}</span>
            </div>
            <blockquote className="dash-quote">{node.quote}</blockquote>
            <span className="text-sm text-iris">
              {node.source}
            </span>
          </li>
        ))}
      </ul>
      <details className="dash-memo">
        <summary>Full memo</summary>
        {item.memo.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </details>
    </article>
  );
}

function Gauge({ score, color }: { score: number; color: string }) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const arc = circ * 0.72;
  const rest = arc - arc * (score / 100);
  return (
    <div className="dash-gauge" aria-hidden>
      <svg viewBox="0 0 120 104">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(28,23,51,0.08)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${arc} ${circ}`} transform="rotate(140 60 60)" />
        <circle
          className="gauge-arc"
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          transform="rotate(140 60 60)"
          style={{ ["--gauge-from" as string]: String(arc), ["--gauge-to" as string]: String(rest), strokeDashoffset: rest }}
        />
      </svg>
      <div className="dash-gauge-num">
        <CountUp className="num" style={{ color }} value={score} />
        <span>Advisory</span>
      </div>
    </div>
  );
}

function Mix({ item, score }: { item: PublicCase; score: number }) {
  const parts = [
    ...item.tiles.filter((tile) => tile.points > 0).map((tile) => ({
      id: tile.id,
      label: tile.label,
      points: tile.points,
      color: TONE[tile.tone],
    })),
    { id: "rest", label: "Not scored", points: 100 - score, color: "rgba(28,23,51,0.16)" },
  ];
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  let cursor = 0;
  const arcs = parts.map((part) => {
    const len = (part.points / 100) * circ;
    const arc = { ...part, len, offset: cursor };
    cursor += len;
    return arc;
  });
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
