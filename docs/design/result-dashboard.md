# Result dashboard

Captured 21 Oct 2026. This replaces the pinned scroll story in How it works. The 30/70 split was a sketch. These products were read for the shape of a single check, not copied.

The worked example is still the approved Quarnby Investment Bank fixture: `quarnby-markets.example`, advisory 75, High risk, FCO warning first published 08/05/2025, retrieved 21 Oct 2026. The donut and the bars are that score’s tile points. The grey slice is the part with no cited source. It is not a “safe” share. No time series is drawn, because none of the sources record one.

## What we looked at

- [RibbonPay Radar reviews](https://docs.ribbonpay.example/radar/reviews) and [risk insights](https://docs.ribbonpay.example/radar/reviews/risk-insights). A queue, then one payment. The page leads with a risk level and a 0–99 score. A short insight list says why. “Show all insights” holds the rest. Related payments sit lower.
- [RiskSieve signals](https://help.risksieve.example/hc/en-us/articles/219073757-Understanding-Signals) and [user details](https://help.risksieve.example/hc/en-us/articles/360032750414-User-Details). Signals are ordered by how much they moved the score. Red, yellow, and green mark the direction. The overview is a few categories. One signal opens for the value and the neighbours. The activity log is another tab.
- [FileBeacon URL report](https://docs.filebeacon.example/docs/results-reports). The header is the detection ratio, the URL, and the review time. Under that, each partner has one status. Relations, headers, and community comments are other tabs.
- [urlscan result](https://urlbeacon.example/docs/result/). The summary is a verdict score from -100 to 100 next to the page that was tasked. Requests, DOM, and the raw lists are the depth. Their own note on [ML verdicts](https://urlbeacon.example/blog/2025/07/14/ml-verdicts-experimental/) is that a model score is one signal, not a block decision.
- [TrustLens](https://www.trustlens.example/articles/trustlens-algorithm-explainer). One trust number, called a risk indicator rather than a verdict, then the reasons grouped as factors. The number without the factors is not the product.
- [BreachBeacon](https://breachbeacon.example/). The field stays. The result opens under it. The first line is the answer. Breaches are a list. Each breach has its own page for the long version.
- Perplexity’s answer page. One column. The question remains. Citations are chips in the answer, not a second site.
- Linecraft’s issue and Vercel’s deployment. A status, a short property row, then activity or logs. Not a wall of charts.
- Portfolio dashboards, including [ACME on SketchHarbour](https://sketchharbour.example/shots/14577694-ACME-Fraud-Management-Dashboard), typical fintech fraud-analytics shots, and [RiskMeter’s report](https://help.riskmeter.example/en/action/report/). Those are fleets: KPI row, a timeline of many events, a pie of a period, a top-ten table. The object is traffic, not one subject.
- [CallBeacon’s analyst UI](https://displaycraft.example/work/fraud-prevention), written up by the designer. The direction that failed was a separate “simple mode”. What held was one screen: a recommendation, the strongest signals, and the long parameter list collapsed. Colour plus a bar, because colour alone is a weak signal.

## Chosen pattern

An answer sheet.

The input is roomy and full width. It does not keep a permanent side column. After a check, the result is the rest of the section, which is most of the viewport once you are there. A 30% form beside a 70% board would shrink the evidence for the life of the page. BreachBeacon and Perplexity both keep the question, then give the width to the answer.

The sheet itself, top to bottom:

1. Verdict. Stamp, advisory gauge, subject, and the date. Same gauge language as the hero. The number is Scam Scout’s reading, with “Advice only. Not a fraud finding.”
2. Mix. A donut and a legend of the tile points, plus a short bar on each signal. That is the infographic. It is the score broken apart, not a trend.
3. Signals. Every tile, including the ones with nothing cited. Status pill, finding, bar. Strongest weights sit in the fixture order the hero already uses.
4. Sources. One row each. Status, a short quote, a link out through `/leaving`. No lines between them.
5. Memo. Closed. One control opens the cited paragraphs in place. The hero still has its drawer. This section does not add a second long sidecar.

On a phone the same order stacks. Signal and source rows keep a coloured left rule, which is the rail, now carrying the evidence instead of four short sentences.

The four moves stay as a compact strip under the field: paste, scouts, cross-check, case file. They frame the sheet. They are not the page.

An unknown string does not leave this page and does not call a service. The sheet keeps the recorded case. A second recorded sample, `northgate-markets.example`, can replace it. Both are fixtures already on the hero.
