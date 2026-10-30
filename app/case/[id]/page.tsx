import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseFile } from "@/components/hud/CaseFile";
import { publicPayload } from "@/lib/replay/public";
import { getReplay } from "@/lib/replay/cache";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const replay = await getReplay(id);
  if (!replay) return { title: "Case" };
  return {
    title: replay.label,
    description: `${replay.report.verdict.label} risk for ${replay.label}. Advice only, not a fraud finding.`,
  };
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replay = await getReplay(id);
  if (!replay) notFound();
  const report = publicPayload(replay.report);
  const subject = report.input.canonical.domain || report.input.canonical.phone || report.input.canonical.names[0] || report.input.raw;

  return (
    <main className="mx-auto grid max-w-[820px] gap-8 px-6 py-16">
      <header>
        <p className="kicker">Recorded case</p>
        <h1 className="page-title mt-3">{replay.label}</h1>
        <p className="mt-3 text-sm text-muted">Fiction, played back from the repository. Advice only, not a fraud finding.</p>
      </header>
      <CaseFile
        subject={subject}
        status="done"
        level={report.verdict.level}
        score={report.verdict.score}
        confidence={report.verdict.confidence}
        typology={report.verdict.primary_typology}
        flags={report.red_flags}
        mitigations={report.mitigations}
        evidence={report.evidence}
        memo={report.memo}
      />
      <Link href={`/demo?case=${replay.id}`} className="btn btn-primary w-fit">Watch this check</Link>
    </main>
  );
}
