# Admin Asset Library Test Fixtures

Test fixtures for State 42 Admin Asset Library (Fonts and Stickers) parser and security test suites.

## Upstream License Information
- Open-source fonts sourced from the Be Vietnam Pro font family:
  - Repository: https://github.com/bettergui/BeVietnamPro
  - Authors: The Be Vietnam Pro Project Authors
  - License: SIL Open Font License, Version 1.1 (`OFL-1.1`)
  - Full license text: `src/test/fixtures/library/vietnamese-font.LICENSE`

---

## Fixture Inventory

### 1. Fonts

| File | Format | Origin / Provenance | License | Purpose |
|---|---|---|---|---|
| `vietnamese-font.ttf` | TrueType (`.ttf`) | Upstream `fonts/ttf/BeVietnamPro-Regular.ttf` (commit `804e62d81abbbcdcce5686069c69b41b8c245192`) | OFL-1.1 | Real font binary with complete Vietnamese glyph coverage (`aăâđêôơư` and accent combinations) for font validation and metadata extraction. |
| `sample-font.otf` | OpenType CFF/TTF (`.otf`) | Upstream `fonts/otf/BeVietnamPro-Regular.otf` (commit `804e62d81abbbcdcce5686069c69b41b8c245192`) | OFL-1.1 | Valid OpenType font fixture for format verification and fontkit parsing. |
| `sample-font.woff` | WOFF (`.woff`) | Generated from upstream `BeVietnamPro-Regular.ttf` using `pyftsubset` (`--flavor=woff --unicodes='*' --layout-features='*' --glyph-names`) | OFL-1.1 | Valid complete WOFF font fixture preserving full Vietnamese codepoints for browser and parser testing. |
| `sample-font.woff2` | WOFF2 (`.woff2`) | Upstream `fonts/webfonts/BeVietnamPro-Regular.woff2` (commit `804e62d81abbbcdcce5686069c69b41b8c245192`) | OFL-1.1 | Valid compressed WOFF2 font fixture for webfont ingestion and metadata verification. |
| `vietnamese-font.LICENSE` | Text | Upstream `OFL.txt` from Be Vietnam Pro repository | OFL-1.1 | Accompanying license text requirement for redistributable OFL fonts. |

### 2. Raster Images

| File | Format | Origin / Provenance | License | Purpose |
|---|---|---|---|---|
| `sample.png` | PNG with alpha | Generated via `sharp` from raw 2x2 RGBA buffer | MIT / Project owned | Valid raster fixture with transparency channel for upload and image metadata validation. |
| `sample.webp` | WebP (lossless) | Generated via `sharp` from raw 2x2 RGBA buffer | MIT / Project owned | Valid raster fixture for WebP decoding and upload validation. |
| `sample.jpg` | JPEG | Generated via `sharp` flattened onto white background | MIT / Project owned | Valid opaque raster fixture for JPEG image parsing. |

### 3. Safe Vector Image

| File | Format | Origin / Provenance | License | Purpose |
|---|---|---|---|---|
| `safe-sticker.svg` | SVG | Authored vector graphic | MIT / Project owned | Valid sticker fixture containing `<defs>`, `<linearGradient>`, local `#id` references (`url(#...)`, `<use href="#id">`), and `<clipPath>`. Safe for ingestion. |

### 4. Hostile / Malicious Vector Images

| File | Attack Vector / Pattern | Origin | Purpose |
|---|---|---|---|
| `malicious-doctype.svg` | XML DOCTYPE & external entity declaration (`<!DOCTYPE ... <!ENTITY ... SYSTEM ...>>`) | Authored security test | Tests rejection/stripping of XML external entity (XXE) vectors. |
| `malicious-script.svg` | Embedded `<script>` element | Authored security test | Tests rejection/stripping of executable JavaScript tags. |
| `malicious-event.svg` | Inline event handlers (`onload`, `onclick`) | Authored security test | Tests rejection/stripping of DOM event execution vectors. |
| `malicious-external-href.svg` | External network URIs in `href` and `xlink:href` | Authored security test | Tests rejection/stripping of SSRF/tracking vectors via external URLs. |
| `malicious-css-url.svg` | Inline style property with remote resource: `url(https://...)` | Authored security test | Tests rejection/stripping of remote resource injection in CSS styles. |
| `malicious-foreign-object.svg` | Embedded `<foreignObject>` containing HTML markup | Authored security test | Tests rejection/stripping of foreign XHTML execution contexts. |
| `malicious-cycle.svg` | Mutual circular local references (`#cycle-a` references `#cycle-b` and vice-versa) | Authored security test | Tests parser protection against infinite recursion and memory exhaustion attacks. |
| `malicious-malformed.svg` | Non-well-formed XML (unclosed `<rect>` tag before `</g>`) | Authored security test | Tests strict XML parse failure handling. |
