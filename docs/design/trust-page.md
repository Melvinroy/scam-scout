# Trust and safety page

Captured 21 Oct 2026. This is `/security` and the control map at `/security/map`. UI repos were read as style references only. Nothing from them was copied. The home trust band is unchanged.

## What we looked at

- [Vercel security](https://vercel.com/security). The page leads with the product surface, a panel of a few figures, then the controls. The badge row and the “yes, we are certified” FAQ are the part we do not take.
- [Linecraft security](https://linecraft.example/security). A short headline, then one line per practice. The first lines are SOC 2, GDPR, HIPAA, and ISO 27001. The short line is the pattern. The seals are not.
- [Nebius trust center](https://nebius.com/trust-center). Three principles, then a catalogue of reports Nebius holds. We take the principle, not the catalogue.
- [WeaveLink safety](https://weavelink.example/safety/). The bound is described at the moment of use. The reassurance copy is not ours to say.
- [Fictional Northgate Group safety example](https://northgate-group.example/safety-and-security/). In this fictional example, Northgate Group can name a licence and the banks that hold customer funds. The useful move is to say the limit in plain language. Scam Scout does not hold money.

## What keeps a security page from turning into a deck

Looked at again on 21 Oct 2026, for the presentation only. The sentences on the two pages did not change.

- DesignLaurels and FWA site-of-the-day pages in security and fintech keep one object in the frame. The camera, the callout, or the lit part changes. A fresh heading for every topic is a slide.
- Linecraft’s method pages move the product surface. The page is the object, not an agenda of sections.
- RibbonPay Sessions and Vercel Ship are keynotes. Copying the agenda as stacked headings is what made the first `/security` pass feel like slides. The useful product-page lesson is one stage.
- Arc and Raycast put one pictured product on the page. A feature is a callout on that picture.
- Nothing and Teenage Engineering explode the object into parts on a bench. A label points at a part. You do not get a new page per knob.
- Pomme’s privacy page (pomme.example/privacy) keeps one illustration. Choosing a topic rearranges the picture and replaces the paragraph in place. The privacy nutrition labels are a catalogue, and that catalogue is the pattern not to copy.
- 1Password treats the vault as the thing you open.
- Cloudflare’s Learning Center article “How does the Internet work?” is a numbered essay, and that essay is deck-like. The hop-by-hop tellings (“life of a request”) light the node you are on and put the sentence on that node. Take the packet on a path, not the numbered article, and not a 3D model of the internet.

## Chosen pattern

One machine, one check. The same instrument on `/security` and `/security/map`. White page, the home type, the home accents. Not WebGL, and not the old town.

The machine is an exploded stack of isometric plates drawn in SVG. A plate has a white top, a paper front, and a coloured side in that control’s accent. The mark is from one drawn set (same grid, same stroke). Names are not printed on the plates.

`/security` splits the check into two stacks — how a page is treated, and where it lives — plus a row of smaller plates for evidence, the advisory line, the three references, and disclosure. `/security/map` is one stack of the eight controls. Limits sit on the bench as dials, on both pages.

Hover or click pulls a plate out. “Step the check”, and the arrow keys, advance. The reading well replaces its paragraph in place. The section title (“How a page is treated.”, “Where it lives.”, and the others) is the well’s kicker while that part is active, so the words stay and the page does not become a stack of headings. `#flow` pulls the first plate of the path. `#disclosure` pulls the disclosure plate. `#limits` still lands on the control map.

On a narrow screen the two stacks sit side by side, smaller, the well moves under them, and the dials wrap. Same object, less travel. Motion is a short lift. `prefers-reduced-motion` already collapses transitions.

## What the pages are allowed to say

Defaults are the unset-env values in `quotaDefaults` and `reportRetentionMs`.

- A live run needs a Google session and a bot-check cookie. Missing either, it is denied.
- Defaults: each account, network and device has a small live-check allowance, with an hourly pace. Reservations roll back together. A shared pool covers hosted checks, and each hosted check reserves its share before it runs. When that reservation will not fit, the route plays a recording. An account that has used its own allowance is refused. Recorded cases stay open.
- Account numbers and card numbers are refused. A valid phone can go through. Emails, key-shaped tokens, and national-id shapes are redacted before a provider call. Private, metadata, and credentialled URLs are blocked before a fetch.
- A fetched page is wrapped as data after instruction-shaped phrases are stripped. A flag whose quote is not in the cited text is dropped. A memo that points at a missing source is dropped. Points and the level are decided in code.
- Memos are rewritten out of “is a scam” and “committed fraud”, and they carry the decision-support line. A low score with low confidence is labelled manual review. The stamp does not move money.
- The framework line is “Designed with reference to” the OWASP Application Security Verification Standard, the OWASP Top 10 for LLM Applications, and the NIST AI Risk Management Framework. It is a reading aid for the build.
- Disclosure is the GitHub private advisory. There is no security mailbox and no bounty.

## What we do not say

No SOC, ISO, PCI, HIPAA, or GDPR certificate. No “compliant”, “certified”, or “bank-grade”. No claim that a framework was assessed or fully implemented. No dev-mode bot-check bypass on the public page.
