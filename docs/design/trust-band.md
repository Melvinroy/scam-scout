# Trust band

Captured 21 Oct 2026. Fourth block on the home page, under Examples. UI repos were read as style references only. Nothing from them was copied. The Trust and safety page (`/security`) is not restyled here.

## What we looked at

- [Nebius trust center](https://nebius.com/trust-center). The page opens with three principles, then a catalogue of reports Nebius actually holds: SOC 2, SOC 3, ISO 27001 and the rest. The catalogue is a certificate wall. We do not have those reports, so the wall is the wrong object.
- [RibbonPay security](https://ribbonpay.example/security). The useful part is specific: restricted keys, audit logs, HSTS, what a control does. The compliance section (PCI Level 1, SOC 1 and 2, EMVCo) belongs to a company that was audited. It is not a pattern to imitate.
- [Vercel security](https://vercel.com/security). The page leads with the product surface, a firewall panel with a few figures, then named controls, then a badge row (ISO, SOC 2, PCI, HIPAA, GDPR) and an FAQ that answers “are you certified?” with yes. The panel is the idea worth keeping. The badges and the yes are not.
- [Linecraft security](https://linecraft.example/security). A short headline, then one line per practice. The first practices are SOC 2, GDPR, HIPAA, and ISO 27001, each with a way to request the report. The short line is worth keeping. The seals are not.
- [WeaveLink safety](https://weavelink.example/safety/). Written for a person about to connect an account. The bound is at the moment of use: permission, then the connection. The reassurance copy (“breathe easy”, “24/7 monitoring”) is not something this project can say.
- [Fictional Northgate Group safety example](https://northgate-group.example/safety-and-security/) and the safeguarding articles. In this fictional example, Northgate Group can say the money is held apart, name the banks, and cite the licence, under the example’s assumed regulatory status. Scam Scout does not hold money and is not a financial institution. Their “what we will not do” is the useful move: say the limit in plain language. Their numbers and their licence are not ours.

## Chosen pattern

A white band, same width and type as the approved sections. No dark field, no seal row, no table, no equal card grid.

The headline is one line. Eight controls follow as a rail: a small figure, the name, one sentence. The figure is the infographic (a provider setting, usage checks, a meter that ends in a recording, a refused number, retention, a citation, an advice stamp). Rows have a hairline and no fill, radius, or shadow.

The sentence under the title links to `/security`, the Trust and safety page. That page keeps the longer map. It is not redesigned in this pass.

## What the figures are allowed to say

- Protected operations enforce authentication and authorization.
- Account numbers and card numbers are refused at intake. A phone that validates is accepted. Private and metadata URLs are blocked before a fetch.
- A flag whose quote is not in the evidence is dropped.
- Memos are rewritten out of “is a scam” and “committed fraud”. The stamp is advice. It does not block a payment.

## What we do not say

No SOC, ISO, PCI, HIPAA, GDPR, or NIST certificate. No “compliant”, “certified”, or “bank-grade”. No FSCS, no licence, no customer-funds claim. Framework names stay on the Trust and safety page, where they are already labelled as a reading aid.
