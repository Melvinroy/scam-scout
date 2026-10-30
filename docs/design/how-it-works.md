# How it works

Captured 21 Oct 2026. Second block on the home page, under the approved hero. The words are four moves. The result is the answer sheet in `docs/design/result-dashboard.md`. The pinned scroll story is retired.

The case is the approved Quarnby Investment Bank fixture (`quarnby-investment-bank` in `lib/ui/public-evidence.ts`): `quarnby-markets.com`, advisory 75, High risk, and the three sources already on the hero (FCO, Rebate Island, Consumer Watch Forum). Nothing in this section is a new claim.

## Product references

- [Nebius](https://nebius.com). After the hero, four capability lines, each a title and one sentence. “From training to inference” is a path, then stories. Not a numbered essay.
- [RibbonPay](https://ribbonpay.example) and the [payment-processing guide](https://ribbonpay.example/guides/payment-processing). The homepage leads with the product. The guide is a verb sequence, one sentence a step. The docs’ state table is not copied.
- [Linecraft](https://linecraft.example). The method is a thing changing state on screen. Prose stays short.
- [Vercel](https://vercel.com). Short labels, the start control in the bar.

## Pattern references

Read for guidance. No component source was copied into this repo. No new dependency.

- [UI/UX Pro Max Skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill). Industry rules and anti-patterns. A trust explainer stays on the existing white field and brand colours. No extra purple gradient.
- [Awesome DESIGN.md](https://github.com/bergside/awesome-design-md-skills). A design note is the contract. This file is that note. Tokens stay in `app/globals.css`.
- [Open Design](https://github.com/nexu-io/open-design) (Apache-2.0) and [Taste Skill](https://github.com/Leonxlnx/taste-skill). Equal feature cards, generic glass, and a centered card grid are the tells this section is avoiding. Dials stay low-variance: white, the brand inks, one story.
- [Impeccable](https://github.com/pbakaus/impeccable). Nested cards, an icon tile on every heading, and gray-on-color are the tells it flags. The desktop scene has no card chrome. The phone rail keeps the left rule Melvin already liked.
- [React Bits](https://github.com/unobtuse/reactbits-frontend-design-skill) (MIT). Motion on transforms, and a reduced-motion path that does not scrub. Their components are not imported.
- [Emil Kowalski’s skills](https://github.com/emilkowalski/skills). Animate transform and opacity, not layout. The scrub eases with the scroll (linear), not with an ease-in on every element. One scene moves; the rest of the page does not.
- Hallmark was in the brief as an anti-slop pass. The confirmed sources used for that pass are Taste Skill and Impeccable. No Hallmark file was copied.
- [SearchGrove Stitch DESIGN.md](https://github.com/searchgrove/design-skills). The brand contract is the token file plus these notes. No second palette.
- [GSAP skills](https://github.com/greensock/gsap-skills) (MIT). The pattern taken is a pinned scroll scene with scrub and `ease: none`. GSAP is not a dependency. The pin is CSS `position: sticky`. The scrub is the existing `requestAnimationFrame` scroll listener.
- [Scroll World](https://github.com/oso95/scroll-world). One continuous scene, no cuts. The phone is its own layout, not a crop of the desktop stage. The repo’s paid image and video pipeline is not used.
- Canvas UI, including MotionGrove’s canvas reveal. A particle canvas would fight the white field. The scene is SVG lines and HTML type.
- [MotionGrove sticky scroll reveal](https://ui.motiongrove.example/components/sticky-scroll-reveal) and Magic UI’s animated beam. Pin the section, change the sentence with the scroll, draw beams between a subject and its sources. Neither library is installed. Beam ends are set by growing `x2` and `y2` (a dash array on a stretched SVG broke an earlier line).

## What shipped

The four moves sit in a short strip under a roomy field. The recorded London case opens beneath them as one sheet: verdict and gauge, the score mix, every signal, the three sources, and a memo that stays closed until it is asked for. Detail is in `docs/design/result-dashboard.md`.

The pattern notes above were read while the scroll story was being tried. They did not choose that layout. Melvin kept the phone rail’s left rule and the line “From a link to a case file.” He did not want the lines between sources.

## Words

Four moves: paste a link or a number, scouts search public sources, evidence is cross-checked, case file verdict. One sentence each. No model name in those lines. Tavily and Nebius Token Factory appear only in the credit.

## Left alone

No second gauge on the hero. The hero scorecard stays as approved. No footer on `/`. No tables, no borrowed illustrations, no RibbonPay, Linecraft, Vercel, or Nebius sentences.
