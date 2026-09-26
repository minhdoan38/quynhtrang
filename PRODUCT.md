# Product

## Platform

Responsive web application, mobile-first.

The primary customer experience is a touch-first product customizer used mainly on phones. Desktop is supported as a more spacious adaptation of the same product, not as a separate workflow.

The application has two operating contexts:

- **Customer:** browse products/templates, customize, preview, validate, and create an order.
- **Admin/editor:** manage templates, sticker assets, fonts and orders; open customer designs and create revisions.

## Users

Primary users are non-designers:

- people buying personalized gifts for friends, partners, family or themselves;
- students and young adults customizing stationery;
- casual creators who are comfortable using social/mobile apps but do not know professional design software;
- small sellers or individuals who need a quick personalized physical product.

Professional designers and enterprise teams are not the primary audience.

Most customers should be assumed to:

- use a phone;
- have limited patience for learning an editor;
- understand photos, text, stickers and templates;
- not understand DPI/PPI, bleed, cut paths, print marks, vector geometry or production terminology;
- expect direct manipulation and immediate visual feedback.

## Product Purpose

Help a non-designer turn personal photos, text and decorative assets into a customized physical print product without needing to learn graphic-design or print-production software.

The product should make the customer feel:

> “I am customizing my gift/product.”

It should not make the customer feel:

> “I am operating design software.”

The product succeeds when customization is emotionally expressive but operationally simple.

The system hides print complexity behind:

- product-specific canvas geometry;
- quality checks;
- friendly warnings;
- safe-area guidance;
- automatic cut contours where relevant;
- product previews;
- templates that can be edited directly.

## Core Jobs To Be Done

### 1. Start quickly

The customer can choose a product, select a variant, and either:

- use a template; or
- start from a blank design.

A blank design must still provide useful starting actions rather than an intimidating empty professional canvas.

### 2. Personalize a template

The customer can:

- replace template photos;
- edit text;
- add images;
- add text;
- add decorative stickers/assets;
- change simple styling;
- move, resize and rotate unlocked elements.

Image replacement should preserve the existing template layout when possible.

### 3. Prepare personal images

The customer can:

- upload from phone;
- crop;
- apply basic masks;
- remove background on demand;
- see whether the image is good enough for its physical print size.

The application keeps the original asset when creating processed derivatives.

### 4. Customize product-specific behavior

The editor adapts to the selected physical product instead of exposing one generic toolset.

### 5. Preview the physical result

The customer can leave edit mode temporarily and see an understandable physical-product preview.

### 6. Catch obvious quality problems

Before ordering, the application runs a friendly preflight and points the customer to problematic objects.

Warnings explain the consequence in everyday Vietnamese rather than print jargon.

### 7. Order without creating an account

A guest can complete the core flow.

Account creation is optional and should be presented later as a benefit for saving or continuing across devices.

## Product Catalog

### Wrapping Paper

Variants:

- A1
- A2

Creation modes:

- repeat pattern;
- full-sheet design.

Repeat-pattern controls may include:

- scale;
- horizontal/vertical spacing;
- rotation;
- background;
- repeat style.

Customer-facing repeat labels should be simple. Technical terms such as “half-drop” should not be required.

Preview:

- flat 2D sheet;
- simplified wrapped-box mockup.

### Card

Variants:

- horizontal;
- vertical.

Surfaces:

- front;
- inside;
- back.

The editor must make the active surface unmistakable.

Preview should communicate:

- closed;
- partially open;
- fully open.

### Sticker

Variants:

- die-cut;
- non-die-cut;
- decorative phone sticker.

“Phone sticker” in MVP is a decorative sticker, not a model-specific full phone skin.

Die-cut flow:

1. upload;
2. optional background removal;
3. subject/alpha contour detection;
4. contour simplification;
5. white-border generation;
6. cut-line preview;
7. border adjustment.

Non-die-cut supports fixed shapes such as:

- square;
- rectangle;
- circle;
- oval;
- rounded rectangle.

### Notebook Cover

One fixed cover size in MVP.

Treat it as a simple front-cover canvas.

No spine/back-wrap system is required in the current scope.

## Primary Customer Journey

```text
Product selection
→ Variant
→ Template or Blank
→ Editor
→ Product-specific customization
→ Preview
→ Preflight
→ Quantity
→ Customer information
→ Server-side approved design snapshot
→ Pending order
→ QR payment demo
→ Confirmation
→ Optional login/account migration
```

The application may use routes, overlays and bottom sheets as appropriate. It should not force this entire journey into one visually overloaded screen.

## Editor Capability

MVP supports:

- text;
- custom font library;
- text color and gradient;
- image upload;
- crop;
- basic masks;
- remove background;
- layers;
- resize;
- rotate;
- opacity;
- shapes;
- sticker/icon library;
- QR code;
- barcode;
- undo/redo;
- duplicate/copy behavior;
- multi-select;
- locking;
- grouping;
- templates;
- product previews;
- resolution/quality checking;
- preflight.

Explicit current non-goals:

- snap alignment;
- smart alignment guides;
- advanced vector path editing;
- full Illustrator/Figma-like tooling;
- real-time collaboration;
- AI generation in MVP;
- printer integration in MVP;
- device-specific phone-skin geometry;
- advanced drawing engine in the first UX pass.

AI may be added later, so generated output should be able to enter the normal document model as ordinary assets/elements.

## Mobile Operating Context

Mobile editor UX is a core product requirement.

The customer may be:

- holding the phone with one hand;
- interrupted frequently;
- using a software keyboard that covers a large part of the screen;
- uploading photos from the phone gallery;
- zooming/panning with touch;
- operating on a mid-range Android device, not only a flagship phone.

Core actions must not depend on:

- hover;
- right click;
- keyboard modifiers;
- tiny handles;
- desktop sidebars;
- long-press-only discovery.

Recommended gesture model:

- tap = select;
- drag selected object = move;
- corner handle = resize;
- rotation handle = rotate;
- two-finger pinch = canvas zoom;
- two-finger pan = canvas pan;
- tap empty canvas = deselect;
- double-tap text = edit;
- double-tap image = crop.

## Progressive Complexity

### Level 1 — Template personalization

A customer should be able to finish an order using only:

- template selection;
- replace image;
- edit text;
- preview;
- finish.

### Level 2 — Normal customization

Expose when needed:

- add text;
- add image;
- add sticker;
- crop;
- color;
- size;
- rotate;
- opacity.

### Level 3 — Advanced customization

Expose deliberately rather than permanently:

- layers;
- grouping;
- multi-select;
- masks;
- pattern controls;
- cut controls.

The majority of the interface should serve Level 1 and Level 2 users.

## Guest Persistence

Editing does not require login.

Guest projects:

- stored locally;
- maximum 3 recent projects;
- retained for 30 days.

Use local persistence appropriate for images and document data. The UX should show autosave quietly and recover from reload when possible.

When the customer begins checkout, the application promotes the design to server storage and creates an immutable approved design version before relying on payment/confirmation UI.

## Checkout and Payment

At checkout collect at minimum:

- name;
- phone number;
- address.

MVP payment QR is a demo mechanism.

Viewing or scanning the QR does not prove payment.

Initial payment state should remain unverified until manually confirmed or a future payment integration verifies it.

## Accounts

Authentication is not required to design.

After a meaningful conversion point, the application may invite the customer to sign in/create an account with a clear benefit such as:

> “Lưu thiết kế để chỉnh tiếp trên thiết bị khác.”

If migration happens:

- do not lose the local project before remote migration succeeds;
- avoid duplicating the same project unnecessarily.

## Admin / Editor Context

Admin can:

- manage orders;
- inspect customer information;
- inspect the exact approved design;
- manually update payment/order status;
- open a design in the same core editor;
- create an admin revision;
- manage templates;
- upload/manage sticker assets;
- upload/manage fonts.

Admin editing must not overwrite the customer-approved version.

Expected version pattern:

```text
v1 — CUSTOMER_APPROVED
v2 — ADMIN_REVISION
v3 — ADMIN_REVISION
```

The customer version remains available for audit/recovery.

## Templates

Templates are full design documents.

Elements have two relevant lock states:

- locked;
- unlocked.

Customers may edit unlocked template content.

Locked template elements are visible but not editable by customers.

Admin can change lock state.

Template authoring uses the same core editor where practical.

## Sticker Asset Library

Sticker/icon assets are uploaded and curated by admin.

The MVP does not depend on a public third-party asset marketplace.

Customer UX should prioritize:

- visual browsing;
- search;
- simple categories;
- large enough thumbnails for touch.

## Font Library

Fonts are uploaded by admin.

Vietnamese glyph support matters.

Font management should make it possible to detect or flag a font that cannot render common Vietnamese text correctly.

The fonts available inside the customer design canvas are content assets and are separate from the application UI typeface.

## Quality / Resolution Behavior

Image quality depends on effective physical print size, not merely uploaded pixel dimensions.

Customer-facing quality states should use simple language such as:

- Tốt;
- Có thể hơi mờ;
- Ảnh quá nhỏ.

Warnings should:

- explain what may happen;
- point to the exact image;
- allow the customer to return to/focus that image.

Do not expose DPI/PPI unless in admin/debug tooling.

## Print-Safety Language

Do not make print-production vocabulary a prerequisite for ordering.

Avoid customer-facing language such as:

- bleed;
- trim box;
- PPI;
- clipping path;
- offset contour.

Prefer:

- Vùng an toàn;
- Vùng sát mép;
- Ảnh có thể hơi mờ;
- Tạo đường cắt;
- Viền sticker.

## Accessibility & Inclusion

The product must remain understandable and usable with:

- Vietnamese UI copy;
- small mobile screens;
- larger text settings where practical;
- color-vision differences;
- keyboard navigation on desktop for surrounding controls;
- non-color warning indicators;
- clear labels for icon-only actions;
- touch targets around 44 CSS px where practical.

Important meaning must not rely only on pastel color differences.

## Voice and Copy

Default UI language: Vietnamese.

Voice:

- short;
- clear;
- friendly;
- concrete;
- non-technical;
- calm.

Avoid:

- printing jargon;
- abstract SaaS language;
- cute copy that obscures the action;
- long instructional paragraphs inside the editor.

Examples:

Prefer:

> Ảnh này có thể hơi mờ khi in.

Over:

> Độ phân giải raster không đạt ngưỡng yêu cầu.

Prefer:

> Giữ chữ trong vùng an toàn.

Over:

> Text intersects the trim/bleed boundary.

## Success Criteria

The first-time mobile customer can:

1. identify what product they are customizing;
2. choose a template or blank start;
3. replace a photo;
4. edit text;
5. add one decorative element;
6. understand where they are in the editor;
7. preview the physical product;
8. understand and correct a quality warning;
9. submit an order without login.

UX success means the customer spends attention on the gift/design, not on understanding the editor.

## Product Guardrails

- Do not turn the product into a generic Canva clone.
- Do not expose all tools permanently.
- Do not put the full customer journey into one overloaded screen.
- Do not make login the first major hurdle.
- Do not let technical print terms dominate customer UI.
- Do not let decorative brand styling reduce canvas/editor clarity.
- Do not silently overwrite user work.
- Do not make admin editing destructive.
- Do not assume desktop behavior can simply be scaled down for mobile.
