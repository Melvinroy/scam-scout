"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Capabilities } from "@/components/landing/Capabilities";
import { ClosingCta } from "@/components/landing/ClosingCta";
import { Examples } from "@/components/landing/Examples";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TrustBand } from "@/components/landing/TrustBand";
import { EvidenceBoard } from "@/components/hud/EvidenceBoard";
import { EXAMPLE_PICKS, PUBLIC_CASES, publicCaseById, publicCaseFor } from "@/lib/ui/public-evidence";

export function Landing() {
  const router = useRouter();
  const [input, setInput] = useState(PUBLIC_CASES[0]?.sample ?? "");
  const [caseId, setCaseId] = useState(PUBLIC_CASES[0]?.id ?? "");
  const [sheetId, setSheetId] = useState("quarnby-investment-bank");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const known = publicCaseFor(input);
    if (known) {
      setCaseId(known.id);
      return;
    }
    const next = `/demo?q=${encodeURIComponent(input.trim())}`;
    const res = await fetch("/api/session").catch(() => null);
    const data = (await res?.json().catch(() => null)) as { user?: unknown } | null;
    if (data?.user) router.push(next);
    else router.push(`/sign-in?callbackUrl=${encodeURIComponent(next)}`);
  }

  return (
    <main>
      <section className="mx-auto grid max-w-[1200px] items-start gap-8 px-6 pb-6 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-10 lg:pt-14">
        <div className="min-w-0">
          <p className="kicker">Before you pay</p>
          <h1 className="display mt-4">
            Check any website, phone number or payee <span className="accent">before you pay.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
            Scam Scout reads public sources and returns a risk level with the evidence.
          </p>
          <form onSubmit={(event) => void onSubmit(event)} className="check-bar mt-8">
            <label className="sr-only" htmlFor="check">Website, phone or payee</label>
            <input
              id="check"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Website, phone or payee"
              className="check-input"
              required
            />
            <button type="submit" className="btn btn-primary check-go shrink-0">Check</button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Example checks">
            <span className="text-sm text-muted">Try:</span>
            {EXAMPLE_PICKS.map((pick) => (
              <button
                key={pick.value}
                type="button"
                className="chip example-pick"
                data-on={input === pick.value}
                onClick={() => {
                  setInput(pick.value);
                  document.getElementById("check")?.focus();
                }}
              >
                <span className="example-kind">{pick.kind}</span> {pick.value}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Pick an example, then press Check. Or <Link href="/sign-in" className="link text-iris">sign in</Link> for a live check.
          </p>
        </div>
        <div className="case-stage min-w-0">
          <span className="orb orb-a" />
          <span className="orb orb-b" />
          <span className="orb orb-c" />
          <div className="relative">
            <EvidenceBoard item={publicCaseById(caseId)} />
          </div>
        </div>
      </section>
      <Capabilities />
      <HowItWorks caseId={sheetId} onCaseId={setSheetId} />
      <Examples onOpen={(id) => {
        setSheetId(id);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.querySelector(".how-sheet")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }} />
      <TrustBand />
      <ClosingCta />
    </main>
  );
}
