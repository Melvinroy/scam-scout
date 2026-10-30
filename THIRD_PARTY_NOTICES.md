# Third-party notices

Scam Scout source code is MIT licensed. Dependencies and assets retain their own licenses.

## Fonts

Geist and Geist Mono by Vercel, Instrument Serif by Rodrigo Fuenzalida and Jordan Egstad, and Outfit by the Outfit project authors are distributed under the SIL Open Font License 1.1 (OFL-1.1). They are loaded through next/font; preserve their copyright and license notices when redistributing font files. Font sources: https://fonts.google.com/ and https://github.com/vercel/geist-font.

## Models and images

KayKit Character Pack: Adventures 1.0 and KayKit City Builder Bits 1.0 by Kay Lousberg (https://www.kaylousberg.com/) are CC0 (Creative Commons Zero 1.0). The scout models and city models in public/models derive from these kits. Weapons were removed and models optimized. assets-src/concept/SCOUTS.md documents the source. No separate raster image assets or local font files are shipped.

public/draco contains Draco decoder support files (Apache-2.0); these are runtime model decoding software.

## Dependency notices

caniuse-lite compatibility data by the caniuse project contributors, https://github.com/browserslist/caniuse-lite, is CC-BY-4.0. The data derives from Can I Use (https://caniuse.com/); attribution is retained here. No project-specific modifications to the data are made.


sharp uses unmodified, dynamically linked libvips native libraries, including @img/sharp-libvips-linux-x64 and @img/sharp-libvips-linuxmusl-x64, under LGPL-3.0-or-later. Source and license information: https://github.com/libvips/libvips and https://sharp.pixelplumbing.com/install/. Preserve LGPL notices and recipients' ability to replace the dynamically linked library.

webgl-constants is MIT licensed (reported as MIT* by the license checker). Other production dependency licenses are checked by scripts/release-gate.mjs.
