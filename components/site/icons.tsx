import type { ReactNode } from "react";

type IconProps = { className?: string };

function Glyph({ className = "h-4 w-4", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export function IconArrow({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Glyph>
  );
}

export function IconKey({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="8" cy="14" r="3.2" />
      <path d="M11 14h9l-1.6 1.8L20 17.5 18.2 19" />
    </Glyph>
  );
}

export function IconMark({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M9 10.5h6l-.6 6.2a2.4 2.4 0 0 1-4.8 0L9 10.5Z" />
      <path d="M10 10.5V8.2a2 2 0 0 1 4 0v2.3" />
      <path d="M12 14.2v.6" />
    </Glyph>
  );
}

export function IconScale({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M12 4v16" />
      <path d="M8 20h8" />
      <path d="m12 6 6 2-6 5-6-5 6-2Z" />
    </Glyph>
  );
}

export function IconExternal({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M14 6h4v4" />
      <path d="M10 14 18 6" />
      <path d="M16 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4.5" />
    </Glyph>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </Glyph>
  );
}

export function IconFile({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 13h6M9 16.5h4" />
    </Glyph>
  );
}

export function IconMask({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 12c2.5-4 13.5-4 16 0-2.5 4-13.5 4-16 0Z" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
    </Glyph>
  );
}

export function IconPeople({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <circle cx="9" cy="9" r="2.2" />
      <circle cx="16" cy="10" r="1.7" />
      <path d="M4.5 18c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6" />
      <path d="M14 14.6c1.2-.4 2.4-.2 3.4.8.6.7 1.2 1.6 1.6 2.6" />
    </Glyph>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Glyph>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <Glyph className={className}>
      <path d="M6 6 18 18M18 6 6 18" />
    </Glyph>
  );
}

const ICONS = {
  search: IconSearch,
  file: IconFile,
  key: IconKey,
  scale: IconScale,
  mask: IconMask,
  people: IconPeople,
} satisfies Record<string, (props: IconProps) => ReactNode>;

export type IconName = keyof typeof ICONS;

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}
