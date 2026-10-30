"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { clearByokKeys } from "@/components/demo/ByokSettings";
import { Brand } from "@/components/site/Brand";
import { IconClose, IconMenu } from "@/components/site/icons";
import { NAV_LINKS, type NavLink } from "@/components/site/site-nav";

interface SessionPayload {
  user: { name?: string | null; email?: string | null } | null;
}

/** The session, or null when the lookup failed or returned something other than a session. */
async function readSession(): Promise<SessionPayload | null> {
  try {
    const res = await fetch("/api/session", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<SessionPayload> | null;
    if (!body || !("user" in body) || (body.user !== null && typeof body.user !== "object")) return null;
    return { user: body.user ?? null };
  } catch {
    return null;
  }
}

export function Header() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [sessionPath, setSessionPath] = useState<string | null>(null);
  const [lookup, setLookup] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const path = usePathname();
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setDrawer(false);
  }

  useEffect(() => {
    let cancelled = false;
    void readSession().then((payload) => {
      if (cancelled) return;
      // A failed lookup keeps the last confirmed state; with none yet the state stays unknown, with a retry.
      setSession((last) => payload ?? last);
      setSessionPath(path);
    });
    return () => {
      cancelled = true;
    };
  }, [path, lookup]);
  const sessionReady = sessionPath === path;
  const sessionUnknown = sessionReady && !session;
  const retry = <button type="button" className="btn btn-ghost btn-sm" aria-label="Check sign-in status again" onClick={() => setLookup((n) => n + 1)}>Try again</button>;

  return (
    <header className="site-header" data-session={!sessionReady ? "pending" : sessionUnknown ? "unknown" : session?.user ? "in" : "out"} data-open={drawer ? "true" : "false"} onKeyDown={(event) => { if (event.key === "Escape") setDrawer(false); }}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-5">
        <Brand />
        <nav className="hidden items-center lg:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => <NavAnchor key={link.href} link={link} className="nav-link" />)}
        </nav>
        <div className="flex items-center gap-2">
          {session?.user ? (
            <span className="hidden items-center gap-3 lg:inline-flex">
              <SignedInAs name={session.user.name || session.user.email} />
              <SignOutButton className="btn btn-ghost btn-sm" />
            </span>
          ) : sessionUnknown ? (
            <span className="hidden lg:inline-flex">{retry}</span>
          ) : sessionReady ? (
            <Link href="/sign-in" className="btn btn-ghost btn-sm hidden lg:inline-flex">Sign in</Link>
          ) : null}
          <Link href="/demo" className="btn btn-primary btn-sm">Check now</Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line lg:hidden"
            aria-expanded={drawer}
            aria-controls="site-drawer"
            aria-label={drawer ? "Close menu" : "Open menu"}
            onClick={() => setDrawer((open) => !open)}
          >
            {drawer ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>
      {drawer ? (
        <div
          id="site-drawer"
          className="drawer lg:hidden"
          // A same-page anchor does not change the path, so close the menu on any link tap.
          onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setDrawer(false); }}
        >
          {session?.user ? <p className="mb-3"><SignedInAs name={session.user.name || session.user.email} /></p> : null}
          <ul className="grid gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}><NavAnchor link={link} className="drawer-link" /></li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            {session?.user ? <SignOutButton className="btn btn-ghost" /> : sessionUnknown ? retry : sessionReady ? <Link href="/sign-in" className="btn btn-ghost">Sign in</Link> : null}
            <Link href="/demo" className="btn btn-primary">Check now</Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function NavAnchor({ link, className }: { link: NavLink; className: string }) {
  return link.external ? (
    <a href={link.href} className={className} target="_blank" rel="noreferrer">{link.title}</a>
  ) : (
    <Link href={link.href} className={className}>{link.title}</Link>
  );
}

function SignedInAs({ name }: { name?: string | null }) {
  return <span className="signed-in-as max-w-56 truncate text-sm text-muted">Signed in as <strong className="font-medium text-ink">{name || "you"}</strong></span>;
}

/** Auth.js signOut posts with its own CSRF token and clears the session cookie; then this origin's home page loads. */
function SignOutButton({ className }: { className: string }) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");
  async function onClick() {
    setState("pending");
    clearByokKeys();
    try {
      await signOut({ redirect: false });
      // Auth.js does not check the response status, so confirm the session is really gone.
      const session = await readSession();
      if (!session || session.user !== null) throw new Error("not_confirmed");
      // A full load drops every client store that still holds signed-in state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setState("failed");
    }
  }
  return (
    <>
      <button type="button" className={className} disabled={state === "pending"} aria-busy={state === "pending"} onClick={() => void onClick()}>
        {state === "pending" ? "Signing out…" : "Sign out"}
      </button>
      {state === "failed" ? <span role="alert" className="text-sm text-high">Sign out did not finish. Try again.</span> : null}
    </>
  );
}
