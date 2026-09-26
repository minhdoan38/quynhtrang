---
name: Quynh Trang Custom Studio
description: A calm pastel stationery workbench that makes personalized print design feel tactile, sentimental, and simple without compromising editor clarity.
colors:
  paper: "#FFFDF8"
  paper-warm: "#F8F3E8"
  surface: "#FFFFFF"
  ink: "#2E3338"
  ink-soft: "#666A6D"
  line: "#DDD6CC"
  line-soft: "#ECE6DC"
  primary: "#315F86"
  primary-deep: "#244A69"
  primary-soft: "#DCEBF4"
  blush: "#E8BCC9"
  blush-deep: "#B86C84"
  butter: "#F2DFA0"
  sage: "#C8D8C4"
  success: "#5F7E67"
  warning: "#A86E22"
  warning-soft: "#F7E8C6"
  danger: "#B3535D"
  danger-soft: "#F6DADD"
typography:
  display:
    fontFamily: "Lora, Georgia, serif"
    fontSize: "clamp(1.75rem, 4vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "\"Be Vietnam Pro\", system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "\"Be Vietnam Pro\", system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "\"Be Vietnam Pro\", system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.paper-warm}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

## Overview

**Creative North Star: "The Pastel Stationery Workbench."**

The product should feel like opening a carefully arranged stationery desk: warm paper, soft pastels, personal photos, small decorative details, and a clear physical sense that the customer is making an object rather than operating generic software.

The supplied visual references establish a recognizable emotional world: warm ivory paper, powder blue, blush pink, butter yellow, muted brown, delicate borders, scrapbook-like photo compositions, cutout imagery, stamps/stickers, handwritten or editorial display type, and sentimental personalized stationery. The application UI should inherit that mood without copying the poster layouts literally.

This is a **product interface**, not a decorative campaign site. The canvas and customer artwork are the visual protagonist. Application chrome should be calmer and quieter than the designs being edited. Decorative stationery language belongs primarily in product browsing, template discovery, empty states, onboarding, confirmation and occasional accents—not behind every toolbar or control.

**Key Characteristics:**

- tactile rather than glossy;
- pastel rather than neon;
- warm-neutral rather than cold gray;
- editorial/crafted rather than generic SaaS;
- personal rather than corporate;
- soft but not low-contrast;
- playful in peripheral surfaces, disciplined in operational surfaces;
- real paper/sticker metaphors used only when they improve comprehension.

**The Artwork Wins Rule.** The editor chrome must recede around the customer’s design. Never place strongly colored panels, gradients, textures, or decorative illustrations directly behind the active canvas.

**The Stationery, Not SaaS Rule.** Avoid the visual clichés of generic AI-built dashboards: purple-blue gradients, glass cards, icons inside rounded-square tiles everywhere, card-inside-card nesting, and excessive gray panels.

**The One Sweet Detail Rule.** A screen may carry one memorable stationery detail—a paper tab, scalloped edge, stamp-like badge, subtle dashed cut guide, or editorial serif heading. Do not stack all of them at once.

The application interface typography is separate from the font library that customers use inside designs. Customer-uploaded/design fonts should never change application chrome.

## Colors

The palette is based on warm stationery paper with a stable blue interaction anchor and soft pastel accents.

### Neutral foundation

- **Paper** (`#FFFDF8`) is the default page background outside the editor and the lightest warm surface.
- **Warm Paper** (`#F8F3E8`) is used for subtle grouped regions, inactive tool areas, empty states and stationery-like background moments.
- **Surface** (`#FFFFFF`) is used for sheets, controls, menus and panels that need crisp separation.
- **Ink** (`#2E3338`) is the default text color.
- **Soft Ink** (`#666A6D`) is reserved for secondary copy, not primary labels.
- **Line** (`#DDD6CC`) is the normal border/divider.
- **Soft Line** (`#ECE6DC`) is used where separation should be barely visible.

### Interaction anchor

- **Primary Blue** (`#315F86`) is the main action and selected-state color.
- **Deep Primary** (`#244A69`) is used for active/pressed states and strong high-contrast text when needed.
- **Soft Primary** (`#DCEBF4`) is used for selected chips, soft highlights and informational backgrounds.

Primary blue is intentionally more stable and readable than the decorative pastels. The customer should always recognize the primary action.

### Pastel accents

- **Blush** (`#E8BCC9`) carries romantic, gift-like warmth.
- **Deep Blush** (`#B86C84`) may be used when blush needs readable foreground contrast.
- **Butter** (`#F2DFA0`) is a warm highlight, not a primary button color.
- **Sage** (`#C8D8C4`) balances the pink/blue palette.

Pastels should support hierarchy, categorization and atmosphere. Do not use pastel-on-pastel for critical text.

### Status colors

- Success: `#5F7E67`
- Warning: `#A86E22`
- Warning background: `#F7E8C6`
- Danger: `#B3535D`
- Danger background: `#F6DADD`

Warnings and errors must use icon/text cues as well as color.

**The Warm Canvas Rule.** Global pages favor Paper/Warm Paper over cold neutral gray.

**The Pastel Is Not a State Rule.** Decorative pink/yellow/green must not replace clear semantic success/warning/error colors.

**The One Anchor Rule.** Use Primary Blue consistently for the main actionable path rather than changing the primary CTA color by product.

## Typography

Application UI uses two roles.

### Interface

**Be Vietnam Pro** is the main application typeface.

Use it for:

- buttons;
- labels;
- body copy;
- input fields;
- toolbars;
- bottom sheets;
- navigation;
- warnings;
- order UI.

It is chosen for high Vietnamese readability and neutral-enough operational clarity.

Default body size is approximately `16px` with `1.5` line height.

Compact UI labels may use `14px`, but important actions should not become tiny.

### Editorial display

**Lora** may be used selectively for:

- page titles;
- product-selection headings;
- template/editor empty-state headlines;
- order confirmation moments;
- short emotionally expressive headings.

Do not use the editorial serif for dense toolbar text, technical controls, long forms or tiny labels.

Avoid script/calligraphy fonts in application chrome. The supplied product references use calligraphy effectively as artwork, but script UI labels would reduce scanning speed and accessibility.

Customer design fonts are content and may be much more expressive.

**The Utility Before Romance Rule.** If a user must act on the text, prefer Be Vietnam Pro. Use Lora where the text sets atmosphere rather than controls behavior.

**The Two-Face Maximum Rule.** Application chrome uses at most the interface sans and editorial serif. Customer artwork is exempt because its fonts are content.

## Layout

The spatial system is mobile-first and canvas-first.

### Customer journey surfaces

Do not render the entire journey as one continuously expanding page.

Use separate routes or clearly bounded modes for major mental tasks such as:

- product selection;
- template browsing;
- editor;
- preview;
- preflight;
- checkout;
- confirmation.

Bottom sheets and overlays are appropriate for local editor tasks.

### Mobile editor

The mobile editor has three spatial zones:

1. compact top bar;
2. dominant canvas stage;
3. bottom action/tool region.

The canvas stage should occupy the majority of the viewport whenever the keyboard is closed.

Permanent sidebars are prohibited on narrow mobile screens.

Selection-specific properties appear contextually.

Tool browsers/properties use bottom sheets.

### Desktop editor

Desktop may use:

- left insertion/library rail;
- central canvas;
- right contextual inspector/layers;
- top project/history actions.

Desktop should reuse the same information model rather than inventing a second editor.

### Spacing

Primary spacing rhythm:

- `4px` micro gap;
- `8px` tight;
- `12px` control grouping;
- `16px` standard;
- `24px` section;
- `32px` large separation.

Do not create arbitrary 7/13/19px spacing unless a component has a specific optical need.

### Canvas stage

The canvas sits on a quiet neutral workbench.

Recommended canvas-stage background is slightly darker/less bright than paper so a white printed product remains visible.

The canvas itself should cast a restrained paper-like shadow.

Do not decorate the workbench with brand patterns.

### Responsive behavior

Mobile actions prioritize thumb reach.

Critical bottom actions must respect device safe-area insets.

When the software keyboard opens:

- keep the editing target visible;
- allow bottom controls to simplify;
- prevent viewport jumps that lose the selected object.

**The Canvas Owns the Middle Rule.** In editing mode, navigation and properties compete for the edges; the canvas owns the center.

**The One Task Per Surface Rule.** A page/major mode should have one dominant job. Use local sheets for local changes rather than stacking checkout, template discovery, preview and admin controls around the editor.

## Elevation & Depth

Depth should feel like layers of paper on a desk, not floating glass.

Use three practical elevation levels:

1. **Flat:** page backgrounds, editor workbench, inline controls.
2. **Lifted:** cards, canvas sheet, dropdown/menu.
3. **Overlay:** bottom sheet, modal, command surface.

Shadows should be soft, low-saturation and physically plausible.

Prefer subtle border + shadow combinations over deep shadows.

Avoid:

- glassmorphism;
- bright colored shadows;
- heavy floating-card stacks;
- shadow on every control.

The strongest shadow belongs to temporary overlays or the physical canvas preview, not normal buttons.

**The Paper Stack Rule.** Elevation communicates which physical layer is above another. If two elements do not overlap conceptually, they usually do not need different shadows.

## Shapes

Corners are soft but disciplined.

- Tiny/internal geometry: `6px`.
- Standard controls: `10px`.
- Cards and grouped controls: `14px`.
- Bottom sheets / large temporary surfaces: `20px`.
- Pills: only for chips, filters, segmented status or compact tags.

Do not make every container a 24–32px rounded card.

Product imagery and template thumbnails may use square-ish paper edges or small corner rounding to feel like printed material.

### Stationery motifs

Permitted sparingly:

- scalloped outer edge;
- postage/stamp perforation;
- thin decorative border;
- dashed cut/safe line;
- paper tab;
- tape/sticker micro-accent.

These motifs should be functional or atmospheric, not repeated on every component.

**The Real Shape Rule.** Use paper/sticker shapes when the metaphor matches the action. A font picker does not need to look like a postage stamp.

**The Pills Are Labels Rule.** Reserve pill shapes for compact semantic units. Primary panels, cards, inputs and buttons use normal soft rectangles.

## Components

### Primary Button

- Primary Blue background.
- White label.
- Minimum comfortable mobile height: `44px`.
- Standard radius: `10px`.
- Strong verb-first Vietnamese label.
- No gradient.
- No icon unless the icon contributes meaning.

Examples:

- `Dùng mẫu này`
- `Xem thử`
- `Tiếp tục`
- `Đặt hàng`

### Secondary Button

- Warm/white surface.
- Ink label.
- Hairline neutral border.
- Same basic geometry as primary.

Do not style secondary actions as gray disabled-looking text.

### Icon Button

- Minimum interaction area around `44×44px`.
- Icon may appear without a visible container in quiet toolbars.
- Selected state uses Soft Primary background + Primary Blue icon.
- Always provide accessible label/title.

Avoid persistent rounded-square icon tiles when no selection/state needs a container.

### Bottom Navigation / Editor Action Bar

The main mobile editor action bar should remain simple.

Typical top-level actions:

- Thêm;
- Mẫu;
- Lớp;
- Xem thử;
- Xong.

Only top-level editor actions live here.

Object-specific properties use a contextual toolbar rather than expanding the main nav indefinitely.

### Contextual Toolbar

When an object is selected, show only relevant actions.

Image example:

```text
Cắt · Xóa nền · Thay ảnh · Viền · Độ mờ · Khóa · …
```

Text example:

```text
Sửa chữ · Font · Màu · Cỡ chữ · Kiểu · Độ mờ · …
```

Horizontal scrolling is acceptable if the first actions are prioritized and the row clearly affords more content.

### Bottom Sheet

Bottom sheets are the primary mobile property surface.

Use:

- clear title;
- optional grabber;
- explicit Done only when changes need committing;
- safe-area-aware bottom padding;
- no nested card wrappers for every option.

Possible heights:

- peek;
- medium;
- near-full-screen.

The sheet must not visually fight the canvas.

### Product Card

Product-selection cards should feel more like stationery/catalog objects than dashboard metrics.

Use:

- large product imagery;
- short product name;
- one short useful description or variant hint;
- subtle paper surface;
- restrained border/shadow.

Avoid icon-above-heading SaaS cards.

### Template Card

The thumbnail is dominant.

Metadata remains minimal.

Primary behavior is visual recognition, not reading.

Selected state should be obvious without placing a heavy overlay over the artwork.

### Input

Inputs use:

- white surface;
- neutral line;
- 44px or greater practical touch height;
- clear top label where needed;
- concise inline error.

Do not rely on placeholder text as the only label.

### Warning / Quality Message

Use friendly consequence-based copy.

Example:

> Ảnh này có thể hơi mờ khi in.

Provide an action such as:

- `Xem ảnh`;
- `Thay ảnh`;
- `Vẫn tiếp tục`.

Warnings should resemble a helpful production assistant, not an IDE diagnostic.

### Quality Badge

Three conceptual states:

- Tốt;
- Có thể hơi mờ;
- Ảnh quá nhỏ.

Keep the badge compact. Do not permanently attach a large warning panel to every image.

### Layer Row

A layer row supports:

- thumbnail/type cue;
- readable name;
- lock state;
- reorder affordance;
- overflow actions.

Avoid tiny hit targets.

### Empty State

Use one strong next action and at most a few alternatives.

Example:

```text
Bắt đầu thiết kế
[Chọn mẫu]
[Thêm ảnh]
[Thêm chữ]
```

A small stationery illustration or editorial title may provide personality, but it must not push the actions below the fold.

### Preview Surface

Preview removes most editor chrome.

The product preview becomes dominant.

Actions:

- `Tiếp tục chỉnh`;
- `Xong`.

### Preflight List

Organize by consequence:

- must fix;
- worth checking;
- ready.

Each issue should navigate to the relevant object.

Do not show a technical table of PPI/coordinates.

## Do's and Don'ts

### Do

- Let customer artwork carry the strongest color and personality inside the editor.
- Use warm paper neutrals throughout the surrounding product.
- Use one stable interaction color for primary actions.
- Borrow the emotional cues of pastel scrapbook stationery without copying the reference posters literally.
- Make template thumbnails large and visual.
- Make “replace image” one of the most discoverable template actions.
- Use contextual tools and bottom sheets to reduce cognitive load.
- Keep mobile touch targets comfortable.
- Use physical-product previews to reassure customers.
- Make quality warnings understandable without print knowledge.
- Use decorative stationery motifs mostly in browsing, onboarding, empty and confirmation states.
- Allow white space. The brand should feel handmade and curated, not crowded.

### Don't

- Do not build a generic gray SaaS dashboard.
- Do not use purple-to-blue AI gradients.
- Do not use glassmorphism as the primary material.
- Do not use pastel text on pastel backgrounds for important copy.
- Do not use script fonts for operational UI.
- Do not place permanent left/right sidebars on mobile.
- Do not show every tool at once.
- Do not wrap every section in a rounded card.
- Do not use icon-only controls without labels/accessibility names.
- Do not let decorative frames compete with the customer canvas.
- Do not convert every icon into a rounded-square tile.
- Do not expose bleed/PPI/cut-path jargon to customers by default.
- Do not let the checkout form visually coexist with the full editor on the same overloaded surface.
- Do not make the design system so “cute” that error states, prices, order status or critical actions become ambiguous.
