"use client";

import { CountUp } from "@/components/ui/CountUp";
import { levelOf, scoreOf, type PublicCase, type Tone } from "@/lib/ui/public-evidence";

const TONE: Record<Tone, string> = {
  adverse: "#c4233a",
  caution: "#b45309",
  unknown: "#8b939c",
};

export function Scorecard({ item, dense = false }: { item: PublicCase; dense?: boolean }) {
  const score = scoreOf(item);
  const level = levelOf(score);
  const color = level === "High" ? TONE.adverse : level === "Medium" ? TONE.caution : "#0c7a43";
  return (
    <article className={dense ? "score-card score-card-dense" : "score-card"} aria-label={`Scorecard for ${item.subject}`}>
      <div className="score-head">
        <RiskGauge score={score} color={color} />
        <div className="min-w-0">
          <p className="stamp text-sm" style={{ color }}>{level} risk</p>
          <p className="mt-2 truncate text-sm font-semibold text-ink">{item.subject}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{item.line}</p>
          <p className="mt-1 text-[11px] text-faint">Advice only. Not a fraud finding.</p>
        </div>
      </div>
      <ul className="score-tiles">
        {item.tiles.map((tile, index) => (
          <li key={tile.id} className="signal rise" data-tone={tile.tone} title={tile.finding} style={{ animationDelay: `${120 + index * 70}ms` }}>
            <SignalIcon id={tile.id} />
            <span className="signal-label">{tile.label}</span>
            <span className="signal-finding">{tile.finding}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RiskGauge({ score, color }: { score: number; color: string }) {
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const arc = circ * 0.72;
  const filled = arc * (score / 100);
  const rest = arc - filled;
  return (
    <div className="score-gauge">
      <svg viewBox="0 0 120 104" aria-hidden>
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
      <div className="score-gauge-num">
        <CountUp accessibleLabel={`Risk score: ${score} of 100`} className="num" style={{ color }} value={score} />
        <span>Advisory</span>
      </div>
    </div>
  );
}

function SignalIcon({ id }: { id: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "regulator") {
    return (
      <svg {...common} aria-hidden>
        <path d="M8 1.5 2.5 4v3.2c0 3.2 2.2 5.5 5.5 6.3 3.3-.8 5.5-3.1 5.5-6.3V4L8 1.5Z" />
        <path d="M6 8.1 7.4 9.5 10.2 6.6" />
      </svg>
    );
  }
  if (id === "contact") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="8" cy="5.2" r="2.2" />
        <path d="M3.2 13.2c.7-2.2 2.5-3.3 4.8-3.3s4.1 1.1 4.8 3.3" />
      </svg>
    );
  }
  if (id === "domain") {
    return (
      <svg {...common} aria-hidden>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 2.6v10.8M2.8 8h10.4M3.6 5.2h8.8M3.6 10.8h8.8" />
      </svg>
    );
  }
  if (id === "reviews") {
    return (
      <svg {...common} aria-hidden>
        <path d="M3 3.2h10v7.2H6.2L3 12.8V3.2Z" />
      </svg>
    );
  }
  if (id === "payment") {
    return (
      <svg {...common} aria-hidden>
        <rect x="1.8" y="3.4" width="12.4" height="9" rx="1.4" />
        <path d="M1.8 6.4h12.4" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <rect x="2.2" y="2.6" width="11.6" height="9.2" rx="1.4" />
      <path d="M5 12.8h6" />
    </svg>
  );
}
