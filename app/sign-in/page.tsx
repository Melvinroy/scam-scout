"use client";

import { fetchClientSession } from "@/lib/client/session";
import { safeCallbackPath } from "@/lib/auth/callback";
import { signIn } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

/** The same words for every refusal, so the page never says which part was wrong. */
const SIGN_IN_ERROR = "That username or password did not work. Check them and try again.";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/demo";
  const [google, setGoogle] = useState<boolean | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [lookup, setLookup] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchClientSession()
      .then((data) => {
        if (cancelled) return;
        setLookupFailed(false);
        setGoogle(Boolean(data.googleAuthConfigured));
      })
      // A failed lookup is unknown, not "Google is off", so it gets a retry.
      .catch(() => { if (!cancelled) setLookupFailed(true); });
    return () => { cancelled = true; };
  }, [lookup]);

  return (
    <main className="mx-auto grid max-w-[1000px] gap-10 px-6 py-16 lg:grid-cols-2 lg:items-start lg:py-24">
      <header>
        <p className="kicker">Sign in</p>
        <h1 className="page-title mt-3">Sign in</h1>
        <p className="mt-4 max-w-sm text-lg leading-relaxed text-muted">
          Recorded cases need no account.
        </p>
      </header>
      <section className="dossier grid gap-5 p-6 md:p-8">
        <button
          type="button"
          disabled={google !== true}
          onClick={() => void signIn("google", { callbackUrl })}
          className="btn btn-ghost w-fit"
        >
          Continue with your account
        </button>
        {lookupFailed && google === null ? (
          <p className="text-sm text-muted">Account sign-in could not be checked. <button type="button" className="link" onClick={() => setLookup((n) => n + 1)}>Try again</button></p>
        ) : null}
        {google === false ? <p className="text-sm text-muted">Account sign-in is not available here. Recorded examples still play.</p> : null}
        {params.has("error") ? <p role="alert" className="text-sm text-high">That sign-in did not work. Try again later.</p> : null}
        <JudgeSignIn callbackUrl={callbackUrl} />
        <Link href="/demo" className="link text-sm text-iris">Back to the check</Link>
      </section>
    </main>
  );
}

function JudgeSignIn({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await signIn("account", { username: form.get("username"), password: form.get("password"), redirect: false });
      if (result?.error) setError(SIGN_IN_ERROR);
      else window.location.assign(safeCallbackPath(callbackUrl, window.location.origin));
    } catch {
      // A refused or throttled post has no redirect URL, so the client throws.
      setError(SIGN_IN_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3 border-t border-line pt-5" onSubmit={(event) => void onSubmit(event)}>
      <p className="text-sm font-medium">Sign in with a username</p>
      <label className="field-label">Username<input name="username" autoComplete="username" required className="field-input" aria-invalid={error ? true : undefined} /></label>
      <label className="field-label">Password<input name="password" type="password" autoComplete="current-password" required className="field-input" aria-invalid={error ? true : undefined} /></label>
      <button type="submit" disabled={busy} className="btn btn-primary w-fit">{busy ? "Signing in…" : "Sign in"}</button>
      {error ? <p role="alert" className="text-sm text-high">{error}</p> : null}
    </form>
  );
}
