export function Diorama({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 800 480" className={`h-full w-full ${className}`} role="img" aria-label="Scout World diorama">
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e1a2b" />
          <stop offset="1" stopColor="#071018" />
        </linearGradient>
      </defs>
      <rect width="800" height="480" fill="url(#sea)" />
      {[
        [400, 250, "#1b3148"],
        [250, 210, "#24364f"],
        [560, 200, "#24364f"],
        [590, 300, "#2a3f5f"],
        [300, 330, "#24364f"],
      ].map(([x, y, fill]) => (
        <polygon key={`${x}-${y}`} points={diamond(Number(x), Number(y), 70, 34)} fill={String(fill)} />
      ))}
      <circle cx="400" cy="214" r="7" fill="#ffd9a0" />
      <circle cx="250" cy="178" r="5" fill="#4da3ff" />
      <circle cx="560" cy="168" r="5" fill="#ff7ac6" />
    </svg>
  );
}

function diamond(x: number, y: number, w: number, h: number): string {
  return `${x},${y - h} ${x + w},${y} ${x},${y + h} ${x - w},${y}`;
}
