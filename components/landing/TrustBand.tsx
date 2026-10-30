import { GITHUB } from "@/components/site/site-nav";
import { TRUST_BAND } from "@/lib/ui/trust-band";

export function TrustBand() {
  return (
    <section className="trust-band" aria-labelledby="trust-title">
      <div className="trust-wrap">
        <div className="trust-head">
          <div>
            <p className="kicker">Trust</p>
            <h2 id="trust-title" className="trust-title">What a case file promises.</h2>
          </div>
          <p className="trust-lede">
            How to read a result. <a href={`${GITHUB}/security`} className="link text-iris" target="_blank" rel="noreferrer">Security policy</a>
          </p>
        </div>
        <ul className="trust-rail">
          {TRUST_BAND.map((item) => (
            <li key={item.id} className="trust-item" style={{ ["--tone" as string]: item.color }}>
              <Figure id={item.id} />
              <h3 className="trust-name">{item.title}</h3>
              <p className="trust-line">{item.line}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Figure({ id }: { id: string }) {
  if (id === "recorded") {
    return (
      <span className="trust-meter" aria-hidden="true">
        <span className="trust-meter-track"><span className="trust-meter-fill" /></span>
        <span className="trust-meter-tag">Recording</span>
      </span>
    );
  }
  if (id === "intake") {
    return <span className="trust-strike" aria-hidden="true">00000000</span>;
  }
  if (id === "evidence") {
    return (
      <svg className="trust-fig" viewBox="0 0 72 40" aria-hidden="true">
        <path d="M8 12c4 0 6 2 6 5v8c-4 0-6-1.5-6-4V12z" fill="#0c8f7d" />
        <path d="M16 28h28" stroke="#0c8f7d" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="52" cy="28" r="3" fill="#0c8f7d" />
        <path d="M48 14h16M50 18.5h12" stroke="#1c1733" strokeOpacity="0.22" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return <span className="trust-stamp" aria-hidden="true">Advice</span>;
}
