> Bank identities, register identifiers, contact details and related URLs below are fictional demo data. Scores and evidence relationships are preserved.

# Case-file evidence sources

Retrieved 21 October 2026. The hero scorecard and evidence map read this recorded set. Nothing here was fetched from a paid API, and the pages are not re-checked when someone opens the site.

The gauge is Scam Scout’s advisory score, not a regulator’s rating and not a fraud finding. A tile scores only when a cited page supports it:

| Tile | Points | When |
| --- | --- | --- |
| Regulator lists | 40 | A regulator page says the subject is not authorised, or calls it a clone firm. |
| Contact / identity | 20 | That page lists contact details and names a different authorised firm with no connection. |
| Site | 15 | That page names the website, or describes the domain as targeting people while claiming to be authorised. |
| Domain age | 10 | A public RDAP record states a registration date. The tile states the date. It does not call the date proof of fraud. |
| Reviews | 10 | A review site states its own score or says it is unsure. |
| Payment method | 0 here | No cited page names a payment channel. The tile says “Not in the cited sources”. |

Quarnby Investment Bank scores 75. northgate-markets.example scores 95. Both are an advisory High (70 or above).

Quotes below are taken from the page text. Where an email was Cloudflare-obfuscated, the address was decoded from that page’s own `data-cfemail` value and is marked as such.

## Case 1 — The Quarnby Investment Bank

Subject as named by the FCO. Website listed on the warning: www.quarnby-markets.example.

### FCO warning — HTTP 200

https://www.fco.example/news/warnings/quarnby-investment-bank-clone-fco-authorised-firm

First published 08/05/2025. Last updated 08/05/2025.

Used for the regulator, contact, and site tiles, and for the FCO node.

The page says: “This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm.”

Under “Clone firm details” it says “Fraudsters are using the following details to scam people” and lists telephone +1 202 555 0101, website www.quarnby-markets.example, and an email that decodes to support@quarnby-markets.example.

Under “FCO authorised firm details” it says: “This is the genuine, authorised firm that the fraudsters are claiming to work for. It has no connection with the clone firm.” It names Westhaven Bank Plc, Firm Reference Number 000001, telephone +44 1632 960001, website www.westhavenbank.example.

It also says dealing with the firm means no Financial Mediation Office access, and no FSCS protection if things go wrong.

### Rebate Island — HTTP 200

https://www.rebate-island.example/en/fco-updates-blacklist-exposing-multiple-unauthorized-forex-platforms/

Article title: “FCO Updates Blacklist, Exposing Multiple Unauthorized Forex Platforms”. The page shows “Updated: 2025/10/13”. `article:published_time` is 2025-10-11.

The article says Rebate Island compiled the FCO’s warning list of unauthorized firms for 6–9 May 2025. In that list it repeats: “Name: The Quarnby Investment Bank (Clone of FCO Authorised firm)”, “Phone: +1 202 555 0101”, “Website: www.quarnby-markets.example”. The same obfuscated email decodes to support@quarnby-markets.example.

This is a news republication of the FCO list, not a separate investigation. The node says so.

### Consumer Watch Forum — HTTP 200

https://consumer-watch.example/2025-05-08/warnungen-der-englischen-finanzmarktaufsicht-fco-182-367224/

Page dated Donnerstag, 08.05.2025. Title: “Warnungen der englischen Finanzmarktaufsicht FCO”. Schema `datePublished` is 2025-05-08.

The table row reads “The Quarnby Investment Bank (Clone of FCO Authorised firm) (new)” with 08/05/2025 and 08/05/2025, and links to the FCO warning.

### Not cited for this case

No source below is linked from a node.

- registry lookup `https://rdap.registry.example/net/v1/domain/quarnby-markets.example` returned HTTP 404 with an empty body. Dropped. Domain age stays “Not in the cited sources”.
- domain-records.example and domain-index.example returned HTTP 200 but did not state a registration date in the HTML. domain-index.example said it had no current record and that the WHOIS server was temporarily unavailable. Not cited.
- TrustLens’s lookup for quarnby-markets.example returned HTTP 200 and the text “Getting score may take a moment”, with no score. Not cited. Reviews stay empty.
- FCO warning-list index `https://www.fco.example/consumers/warning-list-unauthorised-firms` returned HTTP 403.
- Fazzaco’s roundup returned HTTP 502.
- No cited page names a payment method.

## Case 2 — northgate-markets.example

Subject is the domain in the FCO warning title.

### FCO warning — HTTP 200

https://www.fco.example/news/warnings/northgate-markets-example-clone-fco-authorised-firm

First published 13/04/2026. Last updated 02/06/2026.

The description on the page says: “northgate-markets.example (Clone of FCO authorised firm) is not authorised or registered by the FCO but has been targeting people in the UK, claiming to be an authorised firm.”

The body says: “This firm is not authorised by us but has been contacting people pretending to be an authorised firm. We call this a clone firm.”

Clone details: telephones 01632 960003 and 01632 960004, and email addresses written as `'name'@northgate-markets.example`. The page says fraudsters are using those details to scam people.

Genuine firm: “This is the genuine, authorised firm that the fraudsters are claiming to work for. It has no connection with the clone firm.” Northgate Bank UK Limited, FRN 000002, telephone +44 1632 960002, website www.northgate-group.example.

Same Ombudsman and FSCS sentences as the other warning.

### registry lookup — HTTP 200

https://rdap.registry.example/com/v1/domain/northgate-markets.example

Retrieved 21 Oct 2026. `ldhName` is NORTHGATE-MARKETS.EXAMPLE. Events include `registration` at `2026-01-14T17:32:37Z`, `expiration` at `2027-01-14T17:32:37Z`, and `last changed` at `2026-01-14T17:36:29Z`. The registrar vCard `fn` is “NameHarbour, LLC”, IANA registrar ID 1479. The record does not give a reason for the registration. The domain tile states the date only.

NameHarbour’s own RDAP URL returned HTTP 503 and is not linked.

### TrustLens — HTTP 200

https://www.trustlens.example/check-website/northgate-markets.example

The page props show `ratingScore` 56 and the sentences “northgate-markets.example has a slightly low trust score” and “In summary, we checked northgate-markets.example and we are unsure if the website is legit.” Website data on the same page lists WHOIS registration date 2026-01-14, which matches the RDAP event. The reviews tile uses TrustLens’s score and those two sentences. It does not repeat TrustLens’s line about other customers of the registrar.

### Not cited for this case

- `https://www.publicledger.example/view/D64960EA972E0E3E687675562A754A9D471524F8` returned HTTP 403.
- BrokerMirror’s FCO mirror lists northgate-markets.example but its boilerplate says the impersonated firm is not confirmed. The FCO page names Northgate Bank UK Limited, so that mirror is not used.
- A recovery-pitch page that mentions the domain was not used.
- No cited page names a payment method.

## Checked and not used as a case

- FCO clone-firm explainer, HTTP 200: https://www.fco.example/consumers/clone-firms-individuals (the longer path redirects here). It defines a clone firm. It does not name either subject, so it is not a node.
- HMA Investor Alert List, HTTP 200: https://www.hma.example/investor-alert-list. The list page explains what the list is. No single named entry with its own stable detail URL was quoted, so it is not a case on this board.
- ScamGuard verify URL returned HTTP 404 and was dropped.
