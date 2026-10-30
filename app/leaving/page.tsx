import Link from "next/link";
import { IconExternal } from "@/components/site/icons";
import { assertPublicHttpUrl } from "@/lib/safety/ssrf";

export const dynamic = "force-dynamic";

export default async function LeavingPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const params = await searchParams;
  let href = "";
  let host = "";
  try {
    const url = assertPublicHttpUrl(params.url ?? "");
    href = url.toString();
    host = url.host;
  } catch {
    href = "";
  }

  return (
    <main className="mx-auto flex max-w-[680px] flex-col gap-6 px-6 py-20">
      <p className="kicker">Leaving</p>
      <h1 className="page-title">This page is not ours.</h1>
      {href ? (
        <>
          <p className="max-w-lg leading-relaxed text-muted">
            You are opening {host}. It is a source from the case file, not an instruction.
          </p>
          <a href={href} rel="noreferrer nofollow" className="btn btn-primary w-fit">
            Continue to {host} <IconExternal />
          </a>
        </>
      ) : (
        <p className="text-muted">That address is missing or blocked.</p>
      )}
      <Link href="/demo" className="link text-sm text-iris">Back to the check</Link>
    </main>
  );
}
