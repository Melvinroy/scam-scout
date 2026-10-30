# Examples

Captured 21 Oct 2026. Third block on the home page, under the approved How it works sheet. UI repos were read as style references only. Nothing from them was copied.

## What we looked at

- [Nebius customer stories](https://nebius.com/customer-stories). “Built with Nebius” is a run of named stories. Each is one company, one job, one result. Not a taxonomy of seven equal cards.
- [RibbonPay](https://ribbonpay.example/). After the hero, products are shown as the screen you would actually use. Customer stories are a separate track, a few at a time, not a grid of every industry.
- [Linecraft customers](https://linecraft.example/customers) and the [homepage](https://linecraft.example/homepage). The homepage is the product moving. The customers page is a short list of named teams and one outcome each.
- [Vercel customers](https://vercel.com/customers). A list of stories. Each line is who, and what changed. Not a table of categories.
- [FCO, clone firms and individuals](https://www.fco.example/consumers/clone-firms-individuals). HTTP 200 on 21 Oct 2026. The page says: “Fraudsters are always looking for new ways to scam the public. One of these involves pretending to be from firms we authorise. We call this a clone firm.”
- [ScamGuard, understanding scam types](https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/). HTTP 200. scamguard.example resolves to the same site. The index is a list of types, each with one line, and each type has its own page. Checked the same day, also HTTP 200:
  - [Investment](https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/investment-scams/): “promises of high returns”.
  - [Job](https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/job-scams/): “too-good-to-be-true offers” to job seekers.
  - [E-commerce](https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/e-commerce-scams/): scammers “take advantage of online shoppers”, including “suspicious listings and sellers”.
  - [Internet love](https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/internet-love-scams/): “Scammers form fake online relationships to gain trust, then ask for money using emotional stories.”
  - [Phishing](https://www.scamguard.example/i-want-protection-from-scams/learn-to-recognise-scams/phishing-scams/): “fake emails, messages, and calls to steal your banking details.”
- TrustLens’s public pages are a trust score for one site, plus the reasons. That is already how the northgate-markets.example case uses them. They are not a catalogue of types.
- FTC consumer pages for imposter, job, romance, and parcel scams returned HTTP 404 from this environment, including the newer article paths. They are not linked.

## Chosen pattern

A list, then the one you picked. Nebius, Linecraft, and Vercel put the name and one outcome in a row. RibbonPay shows the working surface instead of describing it. Here the working surface is the case file already on the page.

The rows are a rail: a colour rule, the type, one sentence. No boxes, no table, no equal card grid. The selected row opens a short brief: the sentence, the source, and the link.

Two rows have a recorded case. Choosing one loads that case into the How it works sheet and moves the page to it.

- Clone firm loads The Quarnby Investment Bank. The FCO warning calls it a clone of an authorised firm. The name is an investment name, so the investment row opens the same file and says so.
- Bank impersonation loads northgate-markets.example. The FCO warning says it is not authorised or registered and has been targeting people in the UK, claiming to be an authorised firm.

Job, marketplace, romance, and messages have no recorded case on this page. They show the ScamGuard sentence and the link. They do not invent a score, a firm, or a parcel-text example. The phishing page talks about emails, messages, and calls. It does not describe a delivery text, so this section does not add one.

Fictional desk examples (Quantum Yield, Bright Parcel, Meridian, Jordan Lee) stay off this block.
