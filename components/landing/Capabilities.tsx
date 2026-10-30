import { NavIcon } from "@/components/site/icons";
import { CAPABILITIES, SOURCE_TYPES } from "@/lib/ui/capabilities";

export function Capabilities() {
  return (
    <>
      <ul className="source-strip" aria-label="Sources a check reads">
        {SOURCE_TYPES.map((source) => <li key={source}>{source}</li>)}
      </ul>
      <section id="capabilities" className="cap-band" aria-labelledby="cap-title">
        <div className="cap-wrap">
          <p className="kicker">Capabilities</p>
          <h2 id="cap-title" className="cap-title">What a check looks at, before you pay.</h2>
          <ul className="cap-grid">
            {CAPABILITIES.map((item) => (
              <li key={item.title} className="cap-card">
                <span className="tile" data-tone={item.tone}><NavIcon name={item.icon} className="h-4 w-4" /></span>
                <h3>{item.title}</h3>
                <p>{item.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
