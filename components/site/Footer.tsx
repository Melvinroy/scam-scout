import { Brand } from "@/components/site/Brand";
import { NAV_LINKS } from "@/components/site/site-nav";
import { FOOTER_ADVICE, FOOTER_BUILDER, FOOTER_CREDIT, FOOTER_HACKATHON, FOOTER_LEGAL, FOOTER_MISSION } from "@/lib/ui/footer";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="foot-wrap">
        <div className="foot-brand">
          <div>
            <Brand />
            <p className="foot-mission">{FOOTER_MISSION}</p>
          </div>
          <p className="foot-built">{FOOTER_BUILDER}</p>
        </div>
        <nav className="foot-links" aria-label="Footer">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}>{link.title}</a>
          ))}
        </nav>
        <div className="foot-base">
          <p>{FOOTER_CREDIT}</p>
          <p>{FOOTER_ADVICE}</p>
          <p>{FOOTER_HACKATHON}</p>
          <p>{FOOTER_LEGAL}</p>
        </div>
      </div>
    </footer>
  );
}
