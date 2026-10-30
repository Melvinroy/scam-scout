# Compact case file

Replaced on 21 Oct 2026. The hero now uses the scorecard and evidence map in `case-file-evidence-sources.md`. This note is the rejected card, kept so the references are still here.

The hero was showing the whole file: gauge, every flag, every quote, and the memo. That column ran far past the headline, so the first screen became a scroll. The card beside the check has to be a verdict, not the report.

## References

- [RibbonPay Radar risk insights](https://docs.ribbonpay.example/radar/reviews/risk-insights). The payment page leads with one risk level and a score. Risk insights lists the factors that mattered, and “Show all insights” opens the rest. Hundreds of factors never sit in the first block. Reviewed 21 Oct 2026.
- [RibbonPay Radar reviews](https://docs.ribbonpay.example/radar/transaction-reviews). The queue row is a level, a subject, and a few facts. The detail page is a second step.
- [RiskSieve](https://risksieve.example) and [MinnowRisk](https://www.minnowrisk.example). A decision card puts the outcome and the signals that justify it on one surface. The case notes are not the card.
- [FileBeacon](https://www.filebeacon.example) URL reports, as described in the [SearchGrove Threat Intelligence report guide](https://gtidocs.filebeacon.example/docs/results-reports). The header is a score, a verdict, and the subject’s favicon. Detection, details, and relations are tabs. The summary does not dump every engine.
- [SearchGrove Safe Browsing](https://safebrowsing.searchgrove.example) warnings, as shown in [GroveBrowser’s unsafe-site help](https://support.searchgrove.example/browser/answer/99020). One red verdict, one reason, one way through to details. The page does not explain the whole list.
- [Linecraft](https://linecraft.example). An issue peek is a status, a title, and a few properties. Opening the issue is how you get the description.
- [Pomme Wallet](https://www.pomme.example/wallet/). A pass is one card: a status at the top, a few rows, and a tap for the rest. It is sized to the hand, not to the archive.

## What we take

A white card on the coloured stage, no taller than the copy beside it. Top: the stamp (High, Medium, Low), the score, the subject, and one line — the strongest flag’s first sentence, or “Insufficient evidence — manual review” when that is the verdict. Middle: the three highest flags as single rows. Each row has a source mark (a small square with the source’s initial, coloured by source type) because these hosts are `.example` and the page cannot load a third-party favicon. Under them, a trail of scout marks and then source marks, in the order the check brought them in. Bottom: “View full case file” opens a drawer with the existing file, including the memo. If the replay has a case id, the drawer also links to `/case/[id]`.

More than three flags is a count (“2 more in the file”), not a fourth row. The card does not scroll. The drawer may.

## What we do not take

No second gauge, no quote paragraphs, no memo on the card. The full file on the case page and in the demo stays as it is. Trust, use cases, and the developer pages are not part of this pass.
