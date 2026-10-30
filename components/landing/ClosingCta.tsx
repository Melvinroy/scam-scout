import Link from "next/link";
import { CLOSE_LINE, CLOSE_TITLE } from "@/lib/ui/footer";

export function ClosingCta() {
  return (
    <section className="close-band" aria-labelledby="close-title">
      <div className="close-wrap">
        <div>
          <p className="kicker">Check</p>
          <h2 id="close-title" className="close-title">{CLOSE_TITLE}</h2>
          <p className="close-line">{CLOSE_LINE}</p>
        </div>
        <div className="close-actions">
          <a className="btn btn-primary" href="#check">Check now</a>
          <Link className="link text-iris" href="/sign-in">Sign in</Link>
        </div>
      </div>
    </section>
  );
}
