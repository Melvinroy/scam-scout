import Link from "next/link";

export function LogoMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M8 10.2h8l-.75 6.8a3.25 3.25 0 0 1-6.5 0L8 10.2Z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M9.4 10.1V8a2.6 2.6 0 0 1 5.2 0v2.1" />
      <circle cx="12" cy="14.1" r="1" fill="#1c1733" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand">
      <span className="brand-badge">
        <LogoMark />
      </span>
      {compact ? <span className="sr-only">Scam Scout</span> : <span>Scam Scout</span>}
    </Link>
  );
}
