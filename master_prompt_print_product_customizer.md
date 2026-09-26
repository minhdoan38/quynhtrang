# MASTER PROMPT — MOBILE-FIRST PRINT PRODUCT CUSTOMIZER

## 0. ROLE

You are the lead product engineer, UX architect, frontend architect, backend architect, and technical product owner responsible for designing and building a production-quality web application for consumer print-product customization.

You are not building a generic Canva clone.

You are building a **mobile-first, guest-first, product-aware print customization platform** that gives non-designers enough Canva-like editing power to personalize physical products while hiding print-production complexity behind simple language, product-specific tools, automated checks, and realistic previews.

Your responsibility is to make the system coherent end-to-end:

- product discovery;
- template selection;
- blank design creation;
- mobile-first editor;
- product-specific editing behavior;
- image handling;
- background removal;
- sticker contour generation;
- resolution checking;
- preview;
- preflight;
- guest persistence;
- checkout handoff;
- QR payment demo;
- server-side order creation;
- optional account migration;
- admin order handling;
- admin editing;
- template management;
- sticker asset management;
- font management;
- future extensibility.

Do not treat this prompt as a vague feature wishlist. Treat it as the product specification and architectural contract.

When requirements conflict, prioritize in this order:

1. ease of use for non-designers;
2. mobile usability;
3. data safety and reversibility;
4. print-product correctness;
5. maintainable architecture;
6. performance;
7. feature breadth.

Do not add complexity merely because Canva has it.

---

# 1. PRODUCT DEFINITION

Build a web application where customers can customize printed products such as:

1. wrapping paper;
2. cards;
3. stickers;
4. notebook covers.

The core user journey is:

```text
Choose product
→ choose product variant / size
→ choose "start from template" or "design from scratch"
→ customize
→ preview
→ preflight / quality check
→ choose quantity
→ enter customer information
→ create pending order
→ show QR payment demo
→ send order + design to admin
```

The primary users are:

- general consumers;
- students;
- gift buyers;
- small sellers;
- casual creators;
- people with little or no professional design experience.

Do NOT optimize the MVP around:

- professional graphic designers;
- agencies;
- enterprise brand systems;
- collaborative design teams;
- complex print-house integrations.

The editor must feel easier than Canva for this specific job because it understands the physical product being customized.

The product advantage is:

> template → customize → product-specific tooling → automatic quality checking → physical preview → order.

---

# 2. CORE PRODUCT PRINCIPLES

## 2.1 Product-aware, not canvas-first

The canvas engine is infrastructure.

The product experience is the application.

Never make the user configure technical canvas properties such as:

- pixel size;
- DPI;
- bleed settings;
- print color spaces;
- printer marks;
- cut-path technical settings.

The system should understand these internally.

The user should see product language.

For example:

Instead of:

```text
Bleed: 3 mm
```

show:

```text
Vùng sát mép
```

or:

```text
Vùng có thể bị cắt
```

Instead of:

```text
Effective DPI: 118
```

show:

```text
Ảnh này có thể hơi mờ khi in.
```

---

## 2.2 Mobile is the primary editor

This is not a desktop editor that becomes responsive.

The mobile editor is the canonical interaction model.

Desktop may expose more space, keyboard shortcuts, persistent panels, and convenience controls, but it must share the same document model and editing engine.

Design every feature by asking:

> Can a person comfortably use this with one phone in portrait orientation?

---

## 2.3 Progressive complexity

The editor should expose complexity in layers.

### Level 1 — simple customization

A casual user should be able to:

- choose a template;
- replace an image;
- change text;
- change a few colors;
- preview;
- order.

They should never need to understand:

- layers;
- masks;
- groups;
- cut paths;
- resolution;
- contour simplification.

### Level 2 — normal customization

Users may:

- add text;
- add images;
- add shapes;
- add stickers;
- crop;
- resize;
- rotate;
- adjust opacity;
- customize colors;
- use product-specific settings.

### Level 3 — advanced controls

Users may access:

- layers;
- grouping;
- multi-select;
- masking;
- pattern configuration;
- die-cut border options;
- cut-detail options if later exposed.

---

## 2.4 Contextual tools only

Do not show every editor tool all the time.

When an image is selected, show image tools.

When text is selected, show text tools.

When nothing is selected, show document/product tools.

The editor should never look like a desktop graphics program compressed onto a phone.

---

## 2.5 Destructive actions must be reversible

The following must be reversible through history and/or explicit versions:

- delete;
- crop;
- background removal;
- replacement;
- template application;
- admin modifications;
- object transformation.

Admin changes must never overwrite the customer-approved source design.

---

# 3. MVP PRODUCT CATALOG

Implement the product system so these products are configuration-driven, not hardcoded conditionals spread throughout the codebase.

## 3.1 Wrapping paper

Variants:

- A1;
- A2.

Modes:

1. Repeat Pattern;
2. Full Sheet Design.

The customer should never need to specify pixel dimensions.

The product configuration maps human-readable size names to internal physical dimensions.

### Repeat Pattern mode

The user designs a tile or composition and sees it repeated across the wrapping sheet.

Supported repeat styles:

- regular repeat;
- horizontal offset / brick;
- vertical offset / drop;
- mirror.

Customer-facing names should be simple Vietnamese labels.

Controls:

- pattern scale;
- horizontal spacing;
- vertical spacing;
- rotation;
- background color;
- repeat style.

Do not require the user to understand technical seamless-pattern terminology.

### Full Sheet mode

The full sheet acts as a normal editable canvas.

### Preview

Provide:

- 2D design preview;
- box mockup preview.

The box preview does not need a physically accurate 3D renderer in MVP.

A lightweight perspective mockup is acceptable if it clearly communicates how the design will look wrapped around a box.

---

## 3.2 Cards

Variants:

- horizontal;
- vertical.

Document surfaces:

- front;
- inside;
- back.

The inside may internally contain left and right regions.

The editor should present this in a simple page/surface navigation.

Example:

```text
Mặt trước | Bên trong | Mặt sau
```

The user should not have to manage physical imposition.

Show a subtle fold guide where relevant.

### Preview

Support:

- closed;
- partially opened;
- fully opened.

This preview can be visually simulated rather than physically rendered.

---

## 3.3 Stickers

Variants:

1. die-cut;
2. non-die-cut;
3. phone decorative sticker.

For MVP, "phone sticker" means a decorative sticker product, NOT a full-device skin with model-specific camera cutouts.

Do not create an iPhone/Samsung device geometry database in MVP.

### Die-cut workflow

Preferred user flow:

```text
Upload image
→ optional Remove Background
→ detect subject / alpha contour
→ generate contour
→ simplify contour
→ generate white border
→ generate cut outline
→ preview
```

The customer may adjust border thickness.

Keep technical contour complexity hidden by default.

### Non-die-cut

Provide fixed shape options such as:

- square;
- rectangle;
- circle;
- oval;
- rounded rectangle.

More shapes may be added later.

### Sticker preview

Show the result as an isolated cut sticker with the border and cut silhouette clearly visible.

---

## 3.4 Notebook cover

MVP uses one fixed notebook-cover size.

Treat it as a single flat front-cover canvas.

Do not build spine/back-wrap geometry unless explicitly required later.

Provide:

- 2D canvas;
- quality checking;
- safe area;
- preview.

---

# 4. EDITOR FEATURE SCOPE

## 4.1 MVP features

Implement:

- text;
- custom fonts;
- font size;
- font weight when available;
- font color;
- gradient;
- image upload;
- image replacement;
- background removal;
- crop;
- basic masks;
- layers;
- resize;
- rotate;
- opacity;
- shapes;
- sticker/icon asset library;
- QR code;
- barcode;
- undo;
- redo;
- duplicate / copy behavior;
- multi-select;
- object lock;
- grouping;
- template support;
- product-specific tools;
- resolution / image-quality checking;
- safe-area guidance;
- preview;
- preflight.

## 4.2 Explicitly excluded from MVP

Do NOT implement unless necessary for another feature:

- snap-to-object;
- alignment guides;
- complex smart alignment;
- vector pen tool;
- advanced path editor;
- professional typography panel;
- collaborative editing;
- real-time multiplayer;
- AI generation;
- full print-house integration;
- professional printer marks;
- CMYK editing workflow;
- desktop-only keyboard-heavy workflows;
- full device skin templates;
- complex freehand drawing.

Freehand drawing may be added after MVP as a later phase.

---

# 5. MOBILE EDITOR UX

## 5.1 Main layout

The default mobile editor should use approximately this conceptual structure:

```text
┌─────────────────────────────┐
│ ←    Project name      ↶  ↷ │
├─────────────────────────────┤
│                             │
│                             │
│          CANVAS             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│ Thêm  Mẫu  Lớp  Xem thử Xong│
└─────────────────────────────┘
```

Do not permanently show:

- a desktop sidebar;
- a properties inspector;
- a layer panel;
- a huge toolbar;
- unnecessary metadata.

The canvas should dominate the viewport.

---

## 5.2 Primary bottom navigation

Provide approximately these high-level actions:

- Thêm;
- Mẫu;
- Lớp;
- Xem thử;
- Xong.

These are navigation-level actions.

Selection-specific tools should appear separately.

---

## 5.3 Contextual toolbar

When an image is selected, show actions such as:

```text
Cắt
Xóa nền
Thay ảnh
Viền
Độ mờ
Khóa
•••
```

When text is selected:

```text
Sửa chữ
Font
Màu
Cỡ chữ
Kiểu
Độ mờ
•••
```

When a shape is selected:

```text
Màu
Gradient
Viền
Độ mờ
Khóa
•••
```

Only expose actions relevant to the active element.

---

## 5.4 Bottom sheets

Use bottom sheets for property editing.

Examples:

- font browser;
- color picker;
- asset browser;
- layers;
- mask chooser;
- template browser;
- pattern configuration.

Recommended sheet states:

- peek;
- normal;
- expanded.

The user should still retain spatial context with the canvas whenever practical.

---

## 5.5 Mobile gestures

Use predictable touch interactions.

Suggested interaction model:

| Gesture | Action |
|---|---|
| Tap object | Select |
| Drag object | Move |
| Drag corner handle | Resize |
| Drag rotation handle | Rotate |
| Two-finger pinch | Zoom canvas |
| Two-finger pan | Pan canvas |
| Tap empty area | Deselect |
| Double tap text | Enter text edit |
| Double tap image | Enter crop |
| Long press | Optional secondary action only |

Do not depend on long press for essential workflows.

---

## 5.6 Touch targets

Interactive touch targets should generally be at least around 44×44 CSS pixels.

Visual resize handles can be smaller, but the interaction hit area must remain comfortable.

If an element becomes visually tiny, handles must not become unusably tiny.

---

# 6. EDITOR MODES / STATE MACHINE

Do not implement the editor using dozens of unrelated booleans.

Use an explicit interaction state machine.

Suggested major modes:

```text
IDLE
SELECTED
TEXT_EDIT
CROP
MASK
MULTI_SELECT
PATTERN_EDIT
STICKER_CUT_EDIT
PREVIEW
PREFLIGHT
```

Suggested overlay / sheet states:

```text
NONE
TEMPLATE_BROWSER
ASSET_BROWSER
FONT_BROWSER
COLOR_PICKER
LAYERS
BACKGROUND_REMOVAL
MASK_BROWSER
PRODUCT_SETTINGS
```

Only one major interaction mode should be active at once.

Rules:

- crop mode disables accidental object movement outside crop behavior;
- text edit prioritizes keyboard handling;
- preview hides editing controls;
- preflight is read-only except for navigation back to problematic objects;
- background removal cannot silently modify the source asset without creating a reversible action.

---

# 7. TEXT UX

## 7.1 Text insertion

From:

```text
Thêm → Chữ
```

provide simple choices such as:

- Thêm tiêu đề;
- Thêm nội dung.

Do not expose dozens of decorative text presets in MVP.

## 7.2 Text properties

Support:

- font family;
- size;
- available weight;
- color;
- gradient;
- text alignment;
- line height;
- letter spacing;
- opacity;
- rotation.

## 7.3 Keyboard behavior

On mobile:

- when the keyboard opens, keep the selected text visible;
- do not let the keyboard obscure the editing target;
- preserve canvas zoom where practical;
- provide a clear Done action;
- exiting text edit should be deterministic.

---

# 8. IMAGE UX

## 8.1 Upload

Support image input from common mobile sources:

- photo library;
- camera when browser permits;
- file picker.

## 8.2 Replace image

Image replacement is a first-class feature.

When replacing an image inside a template:

Preserve, where reasonable:

- frame dimensions;
- transform;
- mask;
- crop viewport;
- layer position;
- opacity;
- rotation.

This is critical for casual template users.

## 8.3 Crop mode

Double tap or select Crop.

While cropping:

- object frame remains fixed;
- user pans the image;
- user zooms the image;
- optional rotation may be supported;
- normal object movement is disabled.

Provide clear:

```text
Hủy | Xong
```

---

# 9. MASKS

MVP basic masks:

- square;
- circle;
- oval;
- rounded rectangle;
- optionally heart.

Do not build a custom Bézier mask editor in MVP.

Mask data must still be stored generically enough to allow additional mask types later.

---

# 10. BACKGROUND REMOVAL

Background removal happens only when the user explicitly requests it.

Flow:

```text
Upload image
→ user taps Xóa nền
→ process
→ show result
→ Keep / Undo
```

Do not automatically run background removal on upload.

## 10.1 Architecture

Create a provider abstraction:

```ts
interface BackgroundRemovalProvider {
  remove(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult>
  cancel?(jobId: string): Promise<void> | void
}
```

Do not let canvas/editor components depend directly on a particular ML package.

MVP may use a browser-based open-source model/provider when feasible.

Requirements:

- license must be reviewed before production use;
- prefer permissive licenses;
- if a dependency has licensing risk, keep the provider swappable;
- support progress UI;
- handle low-memory mobile devices gracefully;
- allow future migration to a server GPU or API without redesigning the editor.

## 10.2 Asset strategy

Never destructively overwrite the original upload.

Keep:

```text
original asset
derived background-removed asset
```

so undo and reprocessing remain possible.

---

# 11. RESOLUTION / IMAGE QUALITY CHECKER

This is a required subsystem.

Do NOT judge quality based only on source pixel dimensions.

Calculate effective image quality using:

```text
source pixel dimensions
relative crop
physical printed size
scale on product
```

Internally, effective PPI/DPI-like metrics may be used.

Customer-facing states should be simple:

```text
Tốt
Có thể hơi mờ
Ảnh quá nhỏ
```

or equivalent wording.

Do not expose technical PPI unless in admin/debug tooling.

## 11.1 Configurable thresholds

Quality thresholds should be configurable per product or output type.

Do not hardcode one global threshold.

Example configuration concept:

```ts
qualityRules: {
  goodMinPpi: number
  warningMinPpi: number
}
```

## 11.2 UX

When an image is selected:

- optionally show a subtle quality badge.

For warnings:

```text
Ảnh này đang được phóng khá lớn.
Thành phẩm có thể kém nét.
Hãy dùng ảnh chất lượng cao hơn hoặc thu nhỏ ảnh.
```

At preflight:

- warnings should link back to the exact object;
- tapping the warning should focus/select/zoom to the problematic object.

Do not block checkout for normal warnings.

Only severe failures should require explicit confirmation or replacement.

---

# 12. SAFE AREA / EDGE GUIDANCE

Do not present customer-facing print jargon such as "bleed".

Internally, product geometry may still include:

- trim bounds;
- safe area;
- extended background area.

Customer-facing language should be understandable.

Example:

### Vùng an toàn

```text
Đặt chữ và chi tiết quan trọng bên trong vùng này để tránh bị sát mép hoặc mất khi thành phẩm được cắt.
```

Use:

- subtle guides;
- optional tooltip;
- non-intrusive overlays.

Important backgrounds should automatically be allowed/encouraged to extend beyond the finished edge.

---

# 13. TEMPLATE SYSTEM

Templates are full editable design documents.

Users can edit all unlocked elements.

Only two locking states are required:

```text
locked
unlocked
```

Avoid unnecessary permission complexity in MVP.

## 13.1 Template authoring

Admin should use the same core editor.

Admin workflow:

```text
Create design
→ configure elements
→ lock elements if needed
→ assign product
→ assign variant
→ add metadata
→ save as template
→ publish
```

## 13.2 Template metadata

Recommended:

```ts
Template {
  id
  name
  slug
  productType
  productVariant
  thumbnail
  categoryIds
  tags
  status
  designDocument
  createdAt
  updatedAt
  publishedAt
}
```

Statuses:

```text
draft
published
archived
```

## 13.3 Customer template browsing

Mobile browser should support:

- search;
- categories;
- thumbnail grid;
- preview;
- Use this template.

Do not overwhelm users with advanced filtering in MVP.

---

# 14. ASSET LIBRARY

The business/admin uploads its own stickers/icons.

Do not depend on a third-party public sticker marketplace in MVP.

Recommended asset model:

```ts
Asset {
  id
  type
  name
  fileUrl
  thumbnailUrl
  categoryIds
  tags
  status
  metadata
  createdAt
}
```

Supported asset types may include:

```text
sticker
icon
shape
```

Admin should be able to:

- upload;
- categorize;
- tag;
- publish/unpublish;
- delete/archive.

---

# 15. FONT LIBRARY

Fonts are uploaded and managed by admin.

Recommended data:

```ts
FontFamily {
  id
  name
  status
  supportedWeights[]
  supportedStyles[]
  vietnameseSupport
  previewMetadata
}
```

Before publishing a font, validate common Vietnamese glyph coverage using a test string such as:

```text
Trường Đại học Việt Nam – Cảm ơn bạn!
```

If the font lacks needed Vietnamese characters, display a clear admin warning.

Customer font browsing should prioritize:

- visual preview;
- search;
- recent/popular if useful;
- simple categories later.

---

# 16. LAYERS

Layers are not permanently visible on mobile.

Access:

```text
Bottom navigation → Lớp
```

Layer sheet should support:

- select layer;
- reorder;
- lock/unlock user-owned element;
- duplicate;
- delete;
- identify template-locked items.

Customer cannot unlock template elements locked by admin.

Admin can change lock state.

---

# 17. MULTI-SELECT AND GROUPING

Do not require desktop keyboard modifiers on mobile.

Mobile flow:

```text
••• → Chọn nhiều
```

Then:

- tap objects to add/remove selection;
- show selected count;
- expose Group, Delete, Duplicate where valid.

Do not require marquee selection in mobile MVP.

Grouping should make selected elements behave as a single transformable group while preserving child elements in the document model.

---

# 18. UNDO / REDO

Undo and redo are required.

A drag gesture must create one history action, not hundreds.

Same for:

- resize;
- rotation;
- slider adjustment.

History should work at semantic action boundaries.

Examples:

```text
Move image
Resize object
Change font
Change color
Remove background
Replace image
Delete object
Group objects
Apply template
```

Avoid storing huge full-document snapshots for every pointer event.

Use an efficient command/patch or checkpoint strategy.

---

# 19. STICKER CONTOUR ENGINE

Build contour logic as a separate service/module.

Conceptual pipeline:

```text
alpha mask
→ threshold
→ contour extraction
→ noise cleanup
→ contour simplification
→ smoothing
→ offset path
→ white border
→ cut outline
```

Do not generate a path that follows every pixel-level hair or leaf detail.

Contour simplification is mandatory.

## 19.1 Customer controls

Required:

- white border on/off;
- border thickness.

Optional later:

- border color;
- cut-detail slider.

Use friendly language.

Do not expose geometry jargon.

## 19.2 Data

Store contour information in normalized design-space or product-space coordinates so it remains stable across zoom levels.

Do not store only raster previews.

---

# 20. WRAPPING PAPER PATTERN ENGINE

Pattern logic must be separated from generic canvas rendering.

Recommended configuration:

```ts
PatternConfig {
  enabled: boolean
  repeatMode: "regular" | "brick" | "drop" | "mirror"
  scale: number
  spacingX: number
  spacingY: number
  rotation: number
  backgroundColor?: string
}
```

Customer-facing labels should be Vietnamese and non-technical.

The user should be able to modify the source composition and see the repeated result update efficiently.

Do not rerender the entire editor unnecessarily on every small interaction.

---

# 21. PRODUCT PREVIEW SYSTEM

Create a preview renderer abstraction.

Concept:

```ts
interface ProductPreviewRenderer {
  render(document: DesignDocument, product: ProductDefinition): PreviewResult
}
```

Preview types:

```text
Wrapping paper → box mockup
Card → folded/open card
Die-cut sticker → isolated cut sticker
Non-die-cut sticker → fixed-shape sticker
Notebook cover → flat cover preview
```

Preview mode should remove editor chrome and emphasize the product.

Suggested actions:

```text
Tiếp tục chỉnh
Xong
```

---

# 22. PREFLIGHT SYSTEM

Preflight is a user-friendly design quality check.

Do not present technical printer diagnostics.

Potential checks:

- image quality;
- important text outside safe area;
- element completely outside canvas;
- invalid/missing asset;
- missing font;
- sticker contour generation status;
- empty required surface;
- unsupported asset format;
- severe image-processing failure.

Recommended result levels:

```text
pass
warning
error
```

Customer UI example:

```text
Thiết kế gần xong rồi

✓ Kích thước ổn
✓ Nội dung chính nằm trong vùng an toàn
⚠ 1 ảnh có thể hơi mờ
✓ Sticker đã có đường cắt
```

Every warning/error should reference the related object or surface where possible.

---

# 23. DOCUMENT MODEL

The document model must be independent of UI components.

Suggested shape:

```ts
type DesignDocument = {
  id: string
  version: number

  productType: ProductType
  productVariant: string

  surfaces: DesignSurface[]
  elements: DesignElement[]

  productState?: Record<string, unknown>

  createdAt: string
  updatedAt: string
}
```

A surface could represent:

- front;
- inside;
- back;
- wrapping sheet;
- notebook cover.

Suggested:

```ts
type DesignSurface = {
  id: string
  name: string
  physicalWidthMm: number
  physicalHeightMm: number
  safeArea?: Rect
  background?: SurfaceBackground
}
```

---

# 24. ELEMENT MODEL

Use typed elements.

Suggested base:

```ts
type BaseElement = {
  id: string
  type: string
  surfaceId: string

  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number

  locked: boolean
  visible: boolean

  zIndex: number

  createdAt: string
  updatedAt: string
}
```

Possible types:

```text
text
image
shape
sticker
qr
barcode
group
drawing (future)
```

Do not put product-specific conditional behavior directly inside the base element type.

Use extensible type-specific properties.

---

# 25. PRODUCT DEFINITION MODEL

Product behavior should be configuration-driven.

Example concept:

```ts
type ProductDefinition = {
  type: ProductType
  name: string

  variants: ProductVariantDefinition[]

  supportedElementTypes: ElementType[]
  supportedTools: EditorTool[]

  previewType: PreviewType
  preflightRules: PreflightRuleConfig

  capabilities: {
    pattern?: boolean
    contour?: boolean
    multiSurface?: boolean
  }
}
```

Adding a future product should not require rewriting core editor selection logic.

Future products may include:

- tote bag;
- postcard;
- photo book;
- mug;
- envelope;
- packaging;
- phone case.

Architecture should permit these without premature implementation.

---

# 26. CANVAS / RENDERING ARCHITECTURE

Preferred MVP direction:

```text
React
+
Konva
+
react-konva
```

or another equivalent canvas abstraction only if there is a compelling technical reason.

Do not use a commercial editor SDK that creates long-term licensing lock-in without explicit approval.

Separate:

```text
Document state
Editor state
Canvas rendering
Product tools
Preview renderer
Persistence
```

Avoid giant editor components.

Recommended conceptual boundaries:

```text
editor-core/
canvas/
elements/
commands/
history/
selection/
product-tools/
preview/
preflight/
persistence/
assets/
templates/
admin/
orders/
```

---

# 27. CLIENT STATE SEPARATION

Keep at least these categories conceptually separate:

## Document state

Persistent design content.

## Editor UI state

Examples:

- active surface;
- selected IDs;
- zoom;
- pan;
- active mode;
- open sheet;
- temporary crop state.

## Product-specific state

Examples:

- wrapping repeat mode;
- sticker border thickness.

## Persistence state

Examples:

- dirty;
- last saved;
- local project ID;
- upload sync state.

Do not save transient UI state as if it were design content unless it is intentionally useful.

---

# 28. GUEST-FIRST PERSISTENCE

Guest editing does not require login.

Guest projects are stored locally.

Use IndexedDB for:

- design JSON;
- uploaded images;
- derived assets;
- thumbnails;
- background-removed images;
- temporary processed assets.

Use localStorage only for lightweight metadata/preferences if needed.

## 28.1 Project limits

Guest:

- maximum 3 recent projects;
- project retention: 30 days.

Implement automatic cleanup.

Do not unexpectedly delete the currently active project.

Provide graceful storage-limit handling.

---

# 29. CHECKOUT PROMOTION BOUNDARY

The critical persistence transition is:

```text
Local guest project
→ customer starts order
→ server project / immutable design snapshot
→ order
```

Before showing payment QR:

1. run preflight;
2. collect customer information;
3. upload required assets;
4. create server-side project/snapshot;
5. create pending order;
6. only then show QR.

This prevents losing a real order when the browser closes.

---

# 30. CUSTOMER INFORMATION

At order time collect at least:

- name;
- phone number;
- address.

Design form UX for mobile.

Validation should be clear and minimal.

Do not require account registration.

---

# 31. PAYMENT QR — MVP

Payment is only a demo flow in MVP.

Do NOT claim that viewing/scanning the QR proves payment.

Order payment state must initially be:

```text
unverified
```

Recommended statuses:

```text
unverified
paid
cancelled
```

Admin may manually mark an order paid in MVP.

Later integration with VietQR/payment verification should be possible.

---

# 32. OPTIONAL ACCOUNT AFTER CHECKOUT

After the pending order is created and the QR is shown, optionally invite the customer to create/login to an account.

Suggested value proposition:

```text
Lưu thiết kế để chỉnh tiếp trên thiết bị khác.
```

If the customer logs in:

- attach cloud project/order to the account;
- migrate relevant local project;
- preserve local data until migration succeeds;
- do not duplicate projects unnecessarily.

Account is an enhancement, not a gate.

---

# 33. ADMIN ORDER SYSTEM

Admin order page should show:

- order ID;
- customer;
- phone;
- address;
- product;
- product variant;
- quantity;
- price;
- payment state;
- order state;
- preview;
- preflight results;
- design version.

Suggested order statuses:

```text
pending
confirmed
processing
completed
cancelled
```

MVP may keep the workflow simple.

---

# 34. ADMIN DESIGN EDITING AND VERSIONING

Admin can edit a customer design.

However:

**Never overwrite the customer-approved version.**

Use explicit revisions.

Example:

```text
v1 — CUSTOMER_APPROVED
v2 — ADMIN_REVISION
v3 — ADMIN_REVISION
```

Store:

- author type;
- author ID when available;
- timestamp;
- parent version;
- reason/note optionally.

When admin chooses "Edit design":

```text
Create revision
→ open same editor core in admin mode
```

This protects against disputes and accidental destructive changes.

---

# 35. ADMIN EDITOR CAPABILITIES

Reuse the same editor engine.

Admin additionally may:

- unlock/lock template elements;
- publish templates;
- upload/manage assets;
- upload/manage fonts;
- create revisions;
- inspect quality warnings;
- override some warnings.

Do not maintain a separate editor codebase.

---

# 36. ADMIN TEMPLATE MANAGEMENT

Provide:

- template list;
- draft/published/archive state;
- create template;
- duplicate template;
- edit template;
- assign product;
- assign variant;
- category/tag management;
- thumbnail generation;
- publish/unpublish.

---

# 37. ADMIN ASSET MANAGEMENT

Provide sections:

```text
Stickers
Fonts
Templates
```

Sticker upload should support common web formats such as:

- PNG;
- SVG where safely sanitized.

Store:

- title;
- tags;
- categories;
- file;
- thumbnail;
- publish state.

---

# 38. ADMIN FONT MANAGEMENT

Admin should be able to:

- upload font files;
- name the family;
- define weight/style;
- preview;
- validate Vietnamese glyph support;
- publish/unpublish.

Avoid allowing broken fonts to silently enter public templates.

---

# 39. DESIGN VERSIONING

Server-side ordered designs require immutable snapshots.

Recommended distinction:

```text
Project
DesignVersion
Order
```

A project can evolve.

An order points to a specific approved DesignVersion.

Admin revision creates a new DesignVersion.

Never make an existing historical order silently point to the latest mutable document.

---

# 40. SUGGESTED BACKEND DOMAIN MODEL

Adapt names to the chosen database.

Possible entities:

```text
User
Project
ProjectAsset
DesignVersion
Template
TemplateCategory
Asset
AssetCategory
FontFamily
FontFile
Order
OrderItem
CustomerContact
```

For MVP, avoid unnecessary microservices.

A modular monolith is preferred unless there is a clear reason otherwise.

---

# 41. ORDER MODEL

Suggested concept:

```ts
Order {
  id
  customerName
  phone
  address

  status
  paymentStatus

  createdAt
  updatedAt
}
```

Order item:

```ts
OrderItem {
  id
  orderId

  productType
  productVariant
  quantity
  unitPrice
  totalPrice

  designVersionId
}
```

Keep pricing logic separate from canvas/document logic.

---

# 42. API BOUNDARIES

Exact route naming may vary.

Conceptual endpoints:

```text
/templates
/templates/:id
/assets
/fonts

/projects
/projects/:id
/projects/:id/assets
/projects/:id/versions

/orders
/orders/:id

/admin/templates
/admin/assets
/admin/fonts
/admin/orders
```

For local guest editing, do not continuously upload every canvas mutation to the server.

Server synchronization begins when needed, especially at order/account migration boundaries.

---

# 43. FILE / ASSET STORAGE

Use object storage for user uploads and generated assets.

Do not store binary image blobs directly in the relational database.

Maintain asset metadata in the database.

Track:

- original;
- processed;
- thumbnail;
- MIME type;
- width;
- height;
- byte size;
- checksum if useful.

Validate uploads.

---

# 44. SECURITY

At minimum:

- validate MIME type;
- enforce upload-size limits;
- sanitize SVG;
- do not trust file extensions;
- protect admin routes;
- authorize admin mutations;
- prevent users from accessing unrelated server projects/orders;
- rate-limit expensive processing where appropriate;
- do not expose raw internal storage paths;
- escape/sanitize user-controlled metadata;
- validate QR/barcode input;
- ensure generated previews do not execute embedded content.

Treat uploaded SVG as potentially hostile.

---

# 45. PERFORMANCE

Mobile performance is a product requirement.

Avoid:

- rerendering the whole canvas on every pointer movement;
- decoding huge originals repeatedly;
- holding unnecessary full-resolution duplicate bitmaps in memory;
- synchronously processing large images on the main thread where avoidable;
- huge history snapshots for every drag event.

Use:

- thumbnails/proxies for editor display when appropriate;
- original file for final quality/export;
- workers for heavy computation when feasible;
- lazy loading;
- virtualization for large asset/template libraries;
- cancellable image-processing tasks.

Test on mid-range mobile hardware, not only flagship devices.

---

# 46. LARGE IMAGE HANDLING

When a customer uploads a huge image:

1. preserve original;
2. derive an editor-friendly preview;
3. render preview in the editor;
4. maintain mapping back to the original;
5. use original dimensions for quality calculations.

Do not downscale the only copy and lose source fidelity.

---

# 47. RESPONSIVE DESKTOP UX

Desktop should remain familiar but not become a separate product.

Suggested desktop enhancement:

```text
Left: add/templates/assets
Center: canvas
Right: contextual properties/layers
Top: project + undo/redo + preview/finish
```

Do not force mobile bottom sheets on large screens if persistent panels are clearly better.

Document behavior must remain identical.

---

# 48. ACCESSIBILITY

At minimum:

- keyboard accessibility for desktop controls where practical;
- visible focus states;
- readable contrast;
- labels for icon-only controls;
- non-color-only warning indicators;
- adequate touch targets;
- semantic forms;
- screen-reader labels for important actions.

The canvas itself may require specialized accessibility handling, but surrounding workflows should be accessible.

---

# 49. ERROR HANDLING

Handle failures explicitly.

Examples:

- upload fails;
- background removal fails;
- browser storage full;
- font unavailable;
- asset removed;
- server upload interrupted during checkout;
- project migration partially fails;
- contour generation fails;
- image decoder fails;
- QR generation fails.

Never silently destroy user work.

Where possible:

```text
retry
keep local copy
restore previous state
```

---

# 50. AUTOSAVE

Local guest editor should autosave.

Use debounced autosave based on meaningful document changes.

UI may show:

```text
Đã lưu
Đang lưu...
```

Do not save every pointer movement.

When the page unloads unexpectedly, minimize work loss.

---

# 51. PRODUCT-SPECIFIC UX RULES

## Wrapping paper

Primary creation choices:

```text
Lặp họa tiết
Thiết kế toàn tờ
```

## Card

Surface navigation:

```text
Mặt trước
Bên trong
Mặt sau
```

## Die-cut sticker

Primary flow should emphasize:

```text
Ảnh
Xóa nền
Viền sticker
Xem đường cắt
```

## Notebook

Keep it simple and flat.

Do not expose irrelevant sticker/pattern/card tools.

---

# 52. EMPTY STATES

Every product should have a useful blank state.

Example:

```text
Bắt đầu bằng:
[Chọn mẫu]
[Thêm ảnh]
[Thêm chữ]
```

Do not drop a first-time user into a completely empty professional editor.

---

# 53. ONBOARDING

Avoid long tutorial slides.

Use contextual onboarding.

Examples:

First image selected:

```text
Mẹo: dùng "Thay ảnh" để đổi ảnh mà vẫn giữ bố cục.
```

First time near edge:

```text
Giữ chữ trong vùng an toàn để tránh bị sát mép.
```

First resolution warning:

```text
Ảnh bị phóng quá lớn có thể kém nét khi in.
```

Tooltips should be dismissible and not repeat excessively.

---

# 54. PREVIEW BEFORE ORDER

Preview is a required stage but should not trap the user.

Provide:

```text
Tiếp tục chỉnh
Xong
```

Product previews should be fast enough to feel like part of the editor.

---

# 55. CHECKOUT UX

Recommended sequence:

```text
Xong
→ Preflight
→ Product/quantity summary
→ Customer info
→ Create server order
→ QR payment demo
→ Confirmation
→ Optional account
```

Do not ask customer details early during design.

---

# 56. DESIGN LANGUAGE

The UI should feel:

- clean;
- playful enough for consumer customization;
- approachable;
- modern;
- touch-friendly;
- visually calm.

Do not imitate Canva pixel-for-pixel.

Avoid:

- dense pro-software panels;
- excessive borders;
- tiny icons;
- ambiguous icon-only actions;
- overuse of modal dialogs.

Favor:

- bottom sheets;
- large previews;
- contextual controls;
- direct manipulation;
- meaningful labels.

---

# 57. LOCALIZATION

Primary customer language should be structured so Vietnamese works naturally.

Do not scatter hardcoded UI strings across components.

Use an i18n-ready string layer even if only Vietnamese ships initially.

---

# 58. ANALYTICS EVENTS

Prepare a simple analytics event model.

Useful events:

```text
product_selected
variant_selected
template_selected
blank_design_started
image_uploaded
background_removed
quality_warning_seen
preview_opened
preflight_opened
checkout_started
order_created
qr_viewed
account_prompt_viewed
account_created
admin_revision_created
```

Do not collect unnecessary sensitive content.

Analytics should answer:

- where users drop out;
- which templates convert;
- which tools are actually used;
- whether mobile editing causes friction.

---

# 59. FUTURE AI EXTENSION

Do not build AI generation now.

However, keep extension points for future features such as:

- generate image;
- generate pattern;
- generate card layout;
- generate design from prompt;
- smart template recommendation;
- smart text layout.

AI-generated content should enter the system as normal assets/elements rather than requiring a separate document architecture.

---

# 60. NON-GOALS

The MVP is not:

- Canva;
- Figma;
- Illustrator;
- Photoshop;
- a RIP;
- a print-house automation platform;
- a collaboration platform;
- an AI design platform;
- a full ecommerce marketplace.

If a feature does not materially improve:

```text
customize → preview → quality check → order
```

challenge whether it belongs in MVP.

---

# 61. RECOMMENDED IMPLEMENTATION PHASES

## Phase 0 — Foundation

Deliver:

- application shell;
- product catalog model;
- product/variant definitions;
- design document schema;
- persistence abstraction;
- routing;
- core type system;
- basic admin/customer role boundary.

Do not build visual polish before the document model is stable.

---

## Phase 1 — Core editor

Deliver:

- canvas;
- selection;
- move;
- resize;
- rotate;
- text;
- image;
- shape;
- layers;
- lock;
- opacity;
- undo/redo;
- duplicate;
- IndexedDB autosave.

Mobile interactions must work here before proceeding.

---

## Phase 2 — Template + assets

Deliver:

- template browser;
- apply template;
- replace image;
- sticker library;
- font library;
- admin template editor;
- admin sticker upload;
- admin font upload.

---

## Phase 3 — Image tooling

Deliver:

- crop;
- masks;
- background-removal provider;
- original/derived asset handling;
- quality checker.

---

## Phase 4 — Product-specific tooling

Deliver:

- wrapping paper pattern engine;
- card multi-surface model;
- die-cut contour engine;
- non-die-cut shapes;
- notebook fixed canvas.

---

## Phase 5 — Preview + preflight

Deliver:

- product preview abstraction;
- box preview;
- card fold preview;
- sticker cut preview;
- notebook preview;
- preflight;
- warning navigation back to objects.

---

## Phase 6 — Checkout

Deliver:

- quantity;
- customer info;
- server upload boundary;
- immutable approved design version;
- pending order;
- QR demo;
- confirmation.

---

## Phase 7 — Admin order operations

Deliver:

- order list;
- order detail;
- payment state;
- order status;
- design preview;
- create admin revision;
- edit design;
- revision history.

---

## Phase 8 — Account migration

Deliver:

- optional login/signup after order;
- attach order/project to account;
- migrate local project;
- cross-device retrieval.

---

## Phase 9 — Hardening

Deliver:

- performance;
- accessibility;
- storage failure recovery;
- file validation;
- large image tests;
- mobile device tests;
- analytics;
- end-to-end testing.

---

# 62. TESTING STRATEGY

Implement:

## Unit tests

For:

- document operations;
- history;
- quality calculations;
- pattern math;
- contour simplification utilities;
- preflight rules;
- persistence cleanup;
- versioning;
- product configuration.

## Integration tests

For:

- upload → image element;
- template → edit;
- replace image;
- background removal;
- project autosave;
- preflight;
- local-to-server promotion;
- admin revision.

## End-to-end tests

Critical flows:

### Guest wrapping paper

```text
product
→ A1/A2
→ template
→ edit
→ repeat pattern
→ preview
→ checkout
```

### Guest die-cut sticker

```text
upload
→ remove background
→ border
→ quality/preflight
→ preview
→ checkout
```

### Card

```text
template
→ front
→ inside
→ back
→ preview fold
→ order
```

### Admin

```text
receive order
→ inspect design
→ create revision
→ edit
→ save revision
```

---

# 63. MOBILE QA MATRIX

At minimum test:

- small iPhone-like viewport;
- modern iPhone viewport;
- small Android;
- mid-range Android;
- tablet;
- desktop.

Check:

- keyboard opening;
- keyboard closing;
- browser address bar resize;
- pinch zoom;
- canvas pan;
- bottom sheet;
- rotation;
- image upload;
- memory usage;
- large asset handling.

Do not assume `100vh` behaves consistently on mobile.

Use modern viewport handling.

---

# 64. ACCEPTANCE CRITERIA — CORE EDITOR

The core editor is not accepted until:

- text can be added and edited on mobile;
- image can be uploaded from phone;
- image can be moved/resized/rotated reliably;
- image can be replaced while preserving layout;
- undo/redo works at semantic action level;
- crop mode cannot accidentally move the element;
- layers can reorder objects;
- template-locked objects cannot be edited by customers;
- autosave restores a project after reload;
- no desktop-only hover interaction is required for core actions.

---

# 65. ACCEPTANCE CRITERIA — QUALITY CHECK

Accepted when:

- image quality responds to physical scale;
- enlarging an image can change quality state;
- shrinking it can improve state;
- warning points to the exact object;
- warning language is understandable without print knowledge.

---

# 66. ACCEPTANCE CRITERIA — STICKER

Accepted when:

- image can be uploaded;
- background can be removed;
- contour can be generated;
- contour is simplified;
- border thickness can be adjusted;
- preview shows realistic silhouette;
- contour does not create pathological pixel-level paths.

---

# 67. ACCEPTANCE CRITERIA — WRAPPING PAPER

Accepted when:

- A1/A2 variants load correctly;
- repeat pattern updates live;
- regular/brick/drop/mirror modes work;
- scale and spacing are adjustable;
- preview on a box is visually understandable;
- performance remains usable on mobile.

---

# 68. ACCEPTANCE CRITERIA — CARD

Accepted when:

- front/inside/back are separate surfaces;
- user can switch surfaces without losing work;
- fold guidance is understandable;
- preview can show closed/open state;
- template system supports multiple surfaces.

---

# 69. ACCEPTANCE CRITERIA — CHECKOUT

Accepted when:

- order cannot be lost merely because the QR view closes;
- customer info is persisted server-side with the order;
- approved design snapshot is server-side;
- QR does not automatically mark payment successful;
- admin can inspect the exact design version.

---

# 70. ACCEPTANCE CRITERIA — ADMIN

Accepted when:

- admin sees order/customer/product/design;
- admin can mark payment state manually;
- admin can change order state;
- admin can open design in editor;
- admin edit creates a new version;
- customer-approved version remains intact.

---

# 71. ENGINEERING RULES

Follow these rules strictly.

1. Do not write one giant editor component.
2. Do not couple product logic to canvas primitives.
3. Do not couple background removal to a specific UI component.
4. Do not overwrite original uploaded assets.
5. Do not overwrite approved server design versions.
6. Do not require authentication before editing.
7. Do not use localStorage for image blobs.
8. Do not upload every pointer movement to the server.
9. Do not expose print jargon unnecessarily.
10. Do not build snap/alignment in MVP.
11. Do not build AI in MVP.
12. Do not build full device skins in MVP.
13. Do not treat QR display as proof of payment.
14. Do not build a separate admin editor.
15. Do not allow mobile UX to become an afterthought.

---

# 72. CODE QUALITY

Use:

- strict TypeScript;
- clear domain types;
- schema validation at boundaries;
- modular components;
- reusable hooks/services;
- testable pure functions for geometry;
- explicit error handling;
- linting;
- formatting;
- sensible naming.

Avoid:

- `any`;
- unexplained magic constants;
- product-type conditionals scattered everywhere;
- deeply nested UI state;
- business rules hidden in React components;
- irreversible migrations.

---

# 73. GEOMETRY RULES

Establish a consistent internal coordinate system.

Prefer storing dimensions normalized to a product/design coordinate system rather than screen pixels.

Viewport zoom and pan are presentation concerns.

Physical size and design coordinates must remain stable regardless of screen size.

When calculating print-quality metrics, convert design-space geometry back to physical dimensions.

---

# 74. EXPORT / PRODUCTION BOUNDARY

MVP does not integrate directly with printers.

However, document and contour data should be structured so future production export can generate:

- high-resolution raster;
- PDF;
- SVG;
- die-cut vector path;
- print-ready derivatives.

Do not prematurely expose printer export UI to customers.

Admin production export may be added later.

---

# 75. PRICING

Keep pricing separate from editor code.

Product and quantity selection may calculate estimated total.

Use a product pricing service/config.

Do not make canvas components aware of prices.

---

# 76. DEMO DATA

Seed the app with enough demo content to test UX:

- several wrapping-paper templates;
- several horizontal/vertical card templates;
- die-cut sticker examples;
- non-die-cut examples;
- notebook-cover templates;
- sticker assets;
- Vietnamese-compatible fonts.

Do not rely on empty admin data during development.

---

# 77. UX COPY PRINCIPLES

Use short, human language.

Bad:

```text
Insufficient raster resolution.
```

Good:

```text
Ảnh này có thể hơi mờ khi in.
```

Bad:

```text
Bleed boundary exceeded.
```

Good:

```text
Đưa chữ vào vùng an toàn để tránh bị sát mép.
```

Bad:

```text
Generate clipping path.
```

Good:

```text
Tạo đường cắt.
```

---

# 78. PRIMARY CUSTOMER FLOW — FINAL

Implement and optimize this exact conceptual journey:

```text
HOME
↓
Choose Product
↓
Choose Variant
↓
Choose:
  Template
  or
  Blank
↓
EDITOR
↓
Product-specific customization
↓
PREVIEW
↓
PREFLIGHT
↓
Quantity
↓
Customer information
↓
Upload local project to server
↓
Create immutable approved design version
↓
Create pending order
↓
Show QR demo
↓
Confirmation
↓
Optional account creation/login
↓
Attach project/order to account
```

---

# 79. PRIMARY ADMIN FLOW — FINAL

```text
ADMIN LOGIN
↓
Orders
↓
Open order
↓
Customer + product + quantity + payment + preview
↓
Inspect approved design version
↓
Optional:
Create admin revision
↓
Open editor
↓
Edit
↓
Save new version
↓
Continue order workflow
```

---

# 80. WHAT TO DELIVER

When implementing this project, do not stop at visual mockups.

Deliver:

1. architecture documentation;
2. route map;
3. domain model;
4. database schema;
5. product configuration system;
6. core editor;
7. mobile interaction model;
8. local persistence;
9. template system;
10. asset/font admin;
11. image tools;
12. quality checker;
13. product-specific features;
14. preview system;
15. preflight;
16. checkout;
17. QR demo;
18. order persistence;
19. admin;
20. design versioning;
21. tests;
22. seed/demo data;
23. setup instructions.

---

# 81. REQUIRED INITIAL IMPLEMENTATION OUTPUT

Before implementing large amounts of code, produce:

## A. Architecture summary

Explain:

- modules;
- data flow;
- document state;
- editor state;
- persistence;
- product abstraction;
- asset pipeline;
- checkout boundary.

## B. Route map

Customer + admin.

## C. Domain schema

Types and database entities.

## D. Editor component tree

Show major components and responsibilities.

## E. State machine

List modes and transitions.

## F. Implementation plan

Break the work into the phases defined above.

Then begin implementation.

Do not ask for confirmation after every small decision.

If a detail is unspecified but not blocking, make the simplest maintainable decision consistent with this specification and document it.

Ask a question only when:

- a missing requirement fundamentally changes architecture;
- a security-sensitive assumption cannot be safely made;
- a business-critical value cannot reasonably be inferred.

Otherwise proceed.

---

# 82. SUCCESS CRITERIA

The project succeeds when a first-time mobile customer can:

1. choose a product;
2. choose a template;
3. upload their own image;
4. replace the template image;
5. edit text;
6. remove a background if desired;
7. understand whether their image quality is acceptable;
8. preview the physical product;
9. fix any preflight warning;
10. place an order without creating an account.

The experience should feel substantially simpler than opening a generic design tool.

The user should think:

> "I am customizing my product."

Not:

> "I am operating design software."

That principle should guide every product and engineering decision.
