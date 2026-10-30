export const GITHUB = "https://github.com/Melvinroy/scam-scout";

export interface NavLink {
  href: string;
  title: string;
  external?: boolean;
}

/** The whole site is the landing page plus the live check; nav jumps to its sections. */
export const NAV_LINKS: NavLink[] = [
  { href: "/#how-it-works", title: "How it works" },
  { href: "/#demo-cases", title: "Demo cases" },
  { href: GITHUB, title: "Open source", external: true },
];
