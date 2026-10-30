"use client";

import { useEffect, useState } from "react";
import { ILLUSTRATIVE_LABEL, type EvidenceNode, type PublicCase, type Tone } from "@/lib/ui/public-evidence";

const TONE: Record<Tone, string> = {
  adverse: "#c4233a",
  caution: "#b45309",
  unknown: "#8b939c",
};

const SPOTS = [
  { x: 50, y: 18 },
  { x: 24, y: 76 },
  { x: 76, y: 76 },
  { x: 50, y: 84 },
];

export function EvidenceMap({ item }: { item: PublicCase }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const open = item.nodes.find((node) => node.id === openId) ?? null;

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenId(null);
        setPinned(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  function show(id: string) {
    setOpenId(id);
  }

  function toggle(id: string) {
    if (pinned && openId === id) {
      setPinned(false);
      setOpenId(null);
      return;
    }
    setPinned(true);
    setOpenId(id);
  }

  return (
    <section className="emap" aria-label="Evidence map">
      <p className="emap-pop-meta">{ILLUSTRATIVE_LABEL}</p>
      <div className="emap-layout">
        <div className="emap-stage">
          <svg className="emap-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {item.nodes.map((node, index) => {
              const spot = SPOTS[index] ?? SPOTS[0];
              return (
                <line
                  key={node.id}
                  x1="50"
                  y1="46"
                  x2={spot.x}
                  y2={spot.y}
                  stroke={TONE[node.tone]}
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          <div className="emap-merchant" style={{ left: "50%", top: "46%" }}>
            <span>Subject</span>
            <strong>{item.subject}</strong>
          </div>
          {item.nodes.map((node, index) => {
            const spot = SPOTS[index] ?? SPOTS[0];
            return (
              <button
                key={node.id}
                type="button"
                className="emap-node"
                data-tone={node.tone}
                data-open={openId === node.id}
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                aria-expanded={openId === node.id}
                onMouseEnter={() => show(node.id)}
                onFocus={() => show(node.id)}
                onClick={() => toggle(node.id)}
              >
                <span className="emap-dot" style={{ background: TONE[node.tone] }} />
                <span className="emap-kind">{node.kind}</span>
                <span className="emap-name">{node.label}</span>
              </button>
            );
          })}
        </div>
        <div className="emap-proof">
          {open ? <Popover node={open} /> : <p className="emap-prompt">Select an illustrative source to view its fictional quote.</p>}
        </div>
      </div>

      <ul className="emap-chips">
        {item.nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="emap-chip"
              data-tone={node.tone}
              data-open={openId === node.id}
              aria-expanded={openId === node.id}
              onClick={() => toggle(node.id)}
            >
              <span className="emap-dot" style={{ background: TONE[node.tone] }} />
              <span>
                <span className="emap-kind">{node.kind}</span>
                <span className="emap-name">{node.label}</span>
              </span>
            </button>
            {openId === node.id ? <Popover node={node} stacked /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Popover({ node, stacked = false }: { node: EvidenceNode; stacked?: boolean }) {
  const host = hostOf(node.url);
  return (
    <div className={stacked ? "emap-pop emap-pop-stacked" : "emap-pop"} role="dialog" aria-label={`${node.label} source`}>
      <p className="emap-pop-kicker">{node.source}</p>
      <p className="emap-pop-finding">{node.finding}</p>
      <blockquote>“{node.quote}”</blockquote>
      <span className="text-sm font-medium text-iris">
        {host}
      </span>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
