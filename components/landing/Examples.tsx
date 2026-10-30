"use client";

import { CountUp } from "@/components/ui/CountUp";
import { useState } from "react";
import { SCAM_TYPES, type ScamType } from "@/lib/ui/scam-types";
import { ILLUSTRATIVE_LABEL, levelOf, publicCaseById, scoreOf } from "@/lib/ui/public-evidence";

export function Examples({ onOpen }: { onOpen: (caseId: string) => void }) {
  const [activeId, setActiveId] = useState(SCAM_TYPES[0].id);
  const active = SCAM_TYPES.find((item) => item.id === activeId) ?? SCAM_TYPES[0];

  function choose(item: ScamType) {
    setActiveId(item.id);
    if (item.caseId) onOpen(item.caseId);
  }

  return (
    <section id="demo-cases" className="ex-sheet" aria-labelledby="examples-title">
      <div className="ex-wrap">
        <p className="kicker">Demo cases</p>
        <h2 id="examples-title" className="ex-title">The approaches.</h2>
        <p className="ex-lede">{ILLUSTRATIVE_LABEL}. A case opens in the file above. The other rows are descriptions only.</p>
        <div className="ex-grid">
          <ul className="ex-list">
            {SCAM_TYPES.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="ex-row"
                  data-on={item.id === active.id}
                  style={{ ["--tone" as string]: item.color }}
                  aria-pressed={item.id === active.id}
                  onClick={() => choose(item)}
                >
                  <span className="ex-kicker">{item.caseId ? "Recorded" : "Description"}</span>
                  <span className="ex-name">{item.title}</span>
                  <span className="ex-line">{item.line}</span>
                </button>
                {item.id === active.id ? <Brief item={item} inline /> : null}
              </li>
            ))}
          </ul>
          <Brief item={active} />
        </div>
      </div>
    </section>
  );
}

function Brief({ item, inline = false }: { item: ScamType; inline?: boolean }) {
  const recorded = item.caseId ? publicCaseById(item.caseId) : null;
  const score = recorded ? scoreOf(recorded) : null;
  const level = score != null ? levelOf(score) : null;
  const outcome = recorded && score != null && level ? (
    <p className="ex-case">
      <span>{recorded.subject}</span>
      <CountUp className="num" value={score} />
      <span>{level} risk</span>
    </p>
  ) : (
    <p className="ex-empty">No recorded case on this page.</p>
  );
  if (inline) {
    return (
      <div className="ex-brief ex-brief-inline" style={{ ["--tone" as string]: item.color }}>
        {outcome}
        {item.sameFileAs ? <p className="ex-same">Same file as {item.sameFileAs}. The warning uses an investment name.</p> : null}
        <span className="text-sm text-iris">
          {item.source}
        </span>
      </div>
    );
  }
  return (
    <div className="ex-brief ex-brief-side" style={{ ["--tone" as string]: item.color }}>
      <p className="ex-kicker">{item.caseId ? "Recorded case" : "Public description"}</p>
      <h3 className="ex-brief-title">{item.title}</h3>
      <p className="ex-brief-line">{item.line}</p>
      {outcome}
      {item.sameFileAs ? <p className="ex-same">Same file as {item.sameFileAs}. The warning uses an investment name.</p> : null}
      <span className="text-sm text-iris">
        {item.source}
      </span>
    </div>
  );
}
