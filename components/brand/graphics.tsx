/** Decorative product drawings. They do not encode a verdict. */

export function FileConstellation() {
  return (
    <svg viewBox="0 0 280 120" className="pointer-events-none absolute -right-2 top-2 hidden w-40 opacity-80 sm:block" aria-hidden>
      <path d="M18 78 C 60 20, 110 110, 160 48 S 240 20, 262 64" fill="none" stroke="#4f46e5" strokeWidth="1.5" strokeDasharray="4 5" />
      <circle cx="18" cy="78" r="5" fill="#ff5a36" />
      <circle cx="108" cy="86" r="4" fill="#f0b429" />
      <circle cx="168" cy="46" r="5" fill="#14b8a6" />
      <circle cx="262" cy="64" r="4" fill="#4f46e5" />
    </svg>
  );
}

export function ArtStamp() {
  return (
    <svg viewBox="0 0 320 150" className="h-36 w-full" aria-hidden>
      <rect x="36" y="28" width="168" height="96" rx="18" fill="#fff" transform="rotate(-6 120 76)" />
      <rect x="52" y="44" width="136" height="64" rx="10" fill="none" stroke="#ff5a36" strokeWidth="3" transform="rotate(-6 120 76)" />
      <circle cx="230" cy="78" r="36" fill="none" stroke="#ffd0c4" strokeWidth="10" />
      <circle cx="230" cy="78" r="36" fill="none" stroke="#ff5a36" strokeWidth="10" strokeDasharray="150 80" strokeLinecap="round" transform="rotate(-40 230 78)" />
      <circle cx="248" cy="46" r="8" fill="#4f46e5" />
    </svg>
  );
}

export function ArtFlags() {
  return (
    <svg viewBox="0 0 320 150" className="h-36 w-full" aria-hidden>
      <rect x="34" y="36" width="200" height="28" rx="10" fill="#fff" />
      <rect x="48" y="64" width="220" height="28" rx="10" fill="#fff" />
      <rect x="40" y="92" width="180" height="28" rx="10" fill="#fff" />
      <circle cx="58" cy="50" r="5" fill="#ff5a36" />
      <circle cx="72" cy="78" r="5" fill="#f0b429" />
      <circle cx="64" cy="106" r="5" fill="#4f46e5" />
      <rect x="78" y="46" width="90" height="8" rx="4" fill="#ffd7cc" />
      <rect x="92" y="74" width="120" height="8" rx="4" fill="#ffe3b0" />
      <rect x="84" y="102" width="70" height="8" rx="4" fill="#ddd9ff" />
    </svg>
  );
}

export function ArtTrail() {
  return (
    <svg viewBox="0 0 320 150" className="h-36 w-full" aria-hidden>
      <path d="M30 100 C 80 40, 130 130, 180 70 S 260 30, 300 78" fill="none" stroke="#0c8f7d" strokeWidth="3" strokeLinecap="round" />
      <circle cx="30" cy="100" r="8" fill="#ff5a36" />
      <circle cx="124" cy="96" r="7" fill="#f0b429" />
      <circle cx="196" cy="62" r="8" fill="#4f46e5" />
      <circle cx="300" cy="78" r="7" fill="#14b8a6" />
    </svg>
  );
}

export function ArtMemo() {
  return (
    <svg viewBox="0 0 320 150" className="h-36 w-full" aria-hidden>
      <path d="M48 24 h150 l28 28 v74 a12 12 0 0 1-12 12 H48 a12 12 0 0 1-12-12 V36 a12 12 0 0 1 12-12z" fill="#fff" />
      <path d="M198 24 v28 h28" fill="#ddd9ff" />
      <rect x="60" y="68" width="120" height="8" rx="4" fill="#c9c6f5" />
      <rect x="60" y="86" width="90" height="8" rx="4" fill="#ddd9ff" />
      <rect x="60" y="104" width="70" height="8" rx="4" fill="#ffd0c4" />
    </svg>
  );
}

export function artFor(tone: string) {
  if (tone === "coral") return <ArtStamp />;
  if (tone === "amber") return <ArtFlags />;
  if (tone === "tide") return <ArtTrail />;
  return <ArtMemo />;
}
