import Link from "next/link";
import { CountUp } from "@/components/ui/CountUp";
import { FileConstellation } from "@/components/brand/graphics";
import { TYPOLOGY_LABEL, riskColor } from "@/lib/ui/cast";
import type { Evidence, RedFlag } from "@/lib/types";

export interface CaseFileProps {
  subject: string;
  status: "idle" | "running" | "done";
  level?: string;
  score?: number;
  confidence?: string;
  typology?: string | null;
  flags: RedFlag[];
  mitigations: RedFlag[];
  evidence: Evidence[];
  memo: string;
  note?: string;
  /** Shorter quotes for the live card. The case page shows the full file. */
  preview?: boolean;
}

export function CaseFile({
  subject,
  status,
  level,
  score,
  confidence,
  typology,
  flags,
  mitigations,
  evidence,
  memo,
  note,
  preview = false,
}: CaseFileProps) {
  const color = level ? riskColor(level) : "var(--color-faint)";
  const waiting = status === "idle" ? "Ready when you are" : "Checking sources";
  return (
    <article className="dossier case-file relative min-w-0">
      <div className="case-accent" />
      <FileConstellation />
      <div className="relative p-6 sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-iris">Case file</p>
            <h2 className="mt-2 truncate text-2xl tracking-tight text-ink sm:text-3xl">{subject || "Website, phone, or payee"}</h2>
            <p className="mt-2 text-sm text-muted">
              {level ? (
                <>
                  {typology ? TYPOLOGY_LABEL[typology] ?? typology : "No single pattern"}
                  {confidence ? ` · ${confidence} confidence` : ""}
                </>
              ) : (
                waiting
              )}
            </p>
            {level ? <p className="stamp mt-4 text-xl" style={{ color }}>{level}</p> : null}
          </div>
          <RiskGauge level={level} score={score} color={color} />
        </header>

        {level ? <p className="mt-5 text-sm text-muted">Advice only. This is not a fraud finding.</p> : null}

        <section className="mt-7">
          <h3 className="text-sm font-semibold text-ink">Red flags</h3>
          <ul className="mt-2">
            {flags.length === 0 ? <li className="text-sm text-muted">{status === "done" ? "None on this check." : "They appear here as sources come in."}</li> : null}
            {flags.map((flag, index) => {
              const source = evidence.find((item) => flag.evidence_ids?.includes(item.evidence_id));
              return (
                <li key={flag.signal_id} className="flag-card rise mt-2" style={{ animationDelay: `${index * 70}ms` }}>
                  <p className="text-[15px] font-medium text-ink">{flag.title}</p>
                  {flag.explanation ? <p className="mt-1 text-sm leading-relaxed text-muted">{flag.explanation}</p> : null}
                  {source?.url ? (
                    <Link href={`/leaving?url=${encodeURIComponent(source.url)}`} className="link mt-2 inline-block text-sm text-iris">
                      {source.title || source.source_domain}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {mitigations.length ? (
            <p className="mt-3 text-sm text-low">{mitigations.map((item) => item.title).join(" · ")}</p>
          ) : null}
        </section>

        <section className="mt-7">
          <h3 className="text-sm font-semibold text-ink">Source trail</h3>
          {evidence.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{status === "idle" ? "Try an example, or run a check." : "Sources will list themselves here."}</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {evidence.map((item, index) => (
                <li key={`pill-${item.evidence_id}`} className="source-pill rise" style={{ animationDelay: `${index * 60}ms` }}>
                  <span className="trail-dot" style={{ background: TRAIL[index % TRAIL.length] }} />
                  {item.source_domain || item.title}
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-2">
            {evidence.map((item, index) => (
              <li key={item.evidence_id} className="evidence-card rise mt-2" style={{ animationDelay: `${index * 80}ms` }}>
                {item.url ? (
                  <Link href={`/leaving?url=${encodeURIComponent(item.url)}`} className="link text-sm font-medium text-ink">
                    {item.title || item.source_domain}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-ink">{item.title || item.source_domain}</p>
                )}
                <p className="mt-0.5 text-xs text-faint">{item.source_domain}</p>
                {item.quote ? <p className={`mt-1 text-sm leading-relaxed text-muted ${preview ? "line-clamp-2" : ""}`}>{item.quote}</p> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="memo-slip mt-7">
          <h3 className="text-sm font-semibold text-ink">Memo</h3>
          <p className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted ${memo ? "rise" : ""} ${preview ? "line-clamp-6" : ""}`}>
            {memo || (status === "done" ? "No memo on this check." : "Written when the check closes.")}
          </p>
          {note ? <p className="mt-3 text-sm text-high">{note}</p> : null}
        </section>
      </div>
    </article>
  );
}

const TRAIL = ["#ff5a36", "#f0b429", "#14b8a6", "#4f46e5"];

function RiskGauge({ level, score, color }: { level?: string; score?: number; color: string }) {
  const value = typeof score === "number" ? Math.max(0, Math.min(100, score)) : level === "High" ? 78 : level === "Medium" ? 48 : level === "Low" ? 22 : 0;
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const arc = circ * 0.72;
  const filled = arc * (value / 100);
  const rest = arc - filled;
  return (
    <div className="relative h-[92px] w-[100px] shrink-0" aria-hidden={level ? undefined : true}>
      <svg viewBox="0 0 100 86" className="h-full w-full">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(28,23,51,0.08)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${arc} ${circ}`} transform="rotate(140 50 50)" />
        <circle
          className="gauge-arc"
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circ}`}
          transform="rotate(140 50 50)"
          style={{ ["--gauge-from" as string]: String(arc), ["--gauge-to" as string]: String(rest), strokeDashoffset: rest }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
        <span className="num text-lg font-semibold leading-none" style={{ color }}>{typeof score === "number" ? <CountUp value={score} /> : "—"}</span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-faint">Risk</span>
      </div>
    </div>
  );
}
