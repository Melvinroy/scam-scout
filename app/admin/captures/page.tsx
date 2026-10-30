import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readyUsageStore } from "@/lib/abuse/store";
import { allowlistedEmail } from "@/lib/captures/owner";
import type { CaptureSummary } from "@/lib/captures/types";
import { evaluateSpend, formatSpend, spendLimits, SPEND_PAUSE_COPY } from "@/lib/safety/spend";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Captures",
  robots: { index: false, follow: false },
};

export default async function CapturesPage() {
  const email = await allowlistedEmail();
  if (!email) notFound();
  let captures: CaptureSummary[] = [];
  let listUnreadable = false;
  try {
    captures = await (await readyUsageStore()).listCaptures();
  } catch {
    listUnreadable = true;
  }
  const spend = await evaluateSpend();
  let figures: ReturnType<typeof formatSpend> | null = null;
  try {
    figures = spend.reason === "spend_unreadable" ? null : formatSpend(spend, spendLimits());
  } catch {
    // A blank or invalid cap already pauses live checks; the desk shows the pause without figures.
    figures = null;
  }
  return (
    <main className="capture-page">
      <div className="capture-wrap">
        <p className="kicker">Owner</p>
        <h1 className="page-title">Captures</h1>
        <p className="capture-lede">
          A finished live check is stored here. Promote one to play it on the case sheet. Download the JSON and run{" "}
          <code>npm run captures:promote -- path/to/capture.json</code> to keep that preview in the repo.
        </p>
        <section className="capture-spend" data-spend="true">
          <p className="kicker">Spend</p>
          {figures ? (
            <>
              <p className="capture-input">{figures.usd}</p>
              <p className="capture-meta">{figures.daily.replace("Tavily", "Search")}</p>
              <p className="capture-meta">{figures.credits.replace("Tavily", "Search")}</p>
            </>
          ) : (
            <p className="capture-meta">Running spend could not be read.</p>
          )}
          {spend.open ? null : <p className="invite-note">{SPEND_PAUSE_COPY} ({spend.reason})</p>}
        </section>
        {listUnreadable ? (
          <p className="capture-empty">The capture list could not be read.</p>
        ) : captures.length === 0 ? (
          <p className="capture-empty">No captures yet.</p>
        ) : (
          <ul className="capture-list">
            {captures.map((item) => (
              <li key={item.id} className="capture-row">
                <div>
                  <p className="capture-input">{item.input}</p>
                  <p className="capture-meta">
                    {item.createdAt.slice(0, 16).replace("T", " ")} UTC · {item.verdict ?? "No verdict"}
                    {typeof item.tavilyCredits === "number" ? ` · ${item.tavilyCredits} search credits` : ""}
                    {typeof item.nebiusUsd === "number" ? ` · $${item.nebiusUsd.toFixed(4)} model usage` : ""}
                    {item.promoted ? " · Preview" : ""}
                  </p>
                </div>
                <div className="capture-actions">
                  <a className="btn btn-ghost" href={`/api/admin/captures/${item.id}`}>
                    Download JSON
                  </a>
                  {item.promoted ? (
                    <a className="btn btn-primary" href={`/demo?case=${item.previewId || item.id}`}>
                      Open preview
                    </a>
                  ) : (
                    <form method="post" action={`/api/admin/captures/${item.id}/promote`}>
                      <button className="btn btn-primary" type="submit">
                        Promote to preview
                      </button>
                    </form>
                  )}
                  <form method="post" action={`/api/admin/captures/${item.id}/delete`}>
                    <button className="btn btn-ghost" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
