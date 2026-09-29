# State 31: Safe Area UX Design Specification

## 1. Overview & Philosophy
The Safe Area UX system guides customers to keep important design content away from physical cut edges, folds, and binding margins without forcing them to learn print-production terminology.
- Core principle: **"Show where important content is safest without forcing the customer to understand print-production terminology. The system guides, never controls."**
- The Safe Area is **guidance, not a hard constraint**:
  - Never blocks object movement.
  - Never snaps objects inward.
  - Never repositions elements automatically.
  - Never exposes technical terms like `bleed`, `trim tolerance`, `crop marks`, or `registration`.

## 2. Customer Terminology & Mental Model
- Main customer term: **`Vùng an toàn`**
- Short explanation: `Giữ chữ và chi tiết quan trọng bên trong vùng này để tránh bị sát mép hoặc mất khi thành phẩm được cắt.`
- Contextual warning messages:
  - Near outer edge: `⚠ Chi tiết này hơi sát mép.`
  - High risk / outside boundary: `⚠ Chi tiết này có thể bị cắt mất.`
  - Card fold (inside surface): `⚠ Chi tiết quan trọng đang nằm quá gần nếp gấp.`
  - Notebook binding edge: `⚠ Chi tiết này đang khá gần gáy.`
  - Outside physical product bounds: `⚠ Một phần chi tiết này nằm ngoài vùng thành phẩm.`

## 3. Important vs Decorative Content Classification
- **Safe-area sensitive (Important content):**
  - `text`: typography, headings, body text, notes.
  - `qr` / `barcode`: functional codes requiring clear quiet zones.
  - `logo` / `foreground subject`: focal marks.
- **Decorative content (Allowed and encouraged to reach edge / bleed):**
  - Background colors: full-bleed edge coverage.
  - Full-surface photos / background artwork.
  - Decorative shapes and pattern motifs.
  - Do NOT warn about background artwork extending past the safe area or cut boundary.

## 4. Product-Specific Safety Geometry
1. **Outer Boundary Margin:**
   - Standard 4% inset from canvas edges for rectangular layouts (Card, Notebook cover, Wrapping paper full-sheet).
2. **Card Fold Zone:**
   - On `inside` surface of Card, a ±3% zone centered around the fold position (`foldPosition` at 148px for horizontal, 105px for vertical).
   - Only warns when important content (`text`, `qr`, `logo`) falls inside this fold corridor.
3. **Notebook Binding Zone:**
   - Left 12% binding margin on Notebook Cover (`NOTEBOOK_COVER_DEFINITION.bindingMarginPct = 12`).
   - Warns when important content encroaches within the binding margin: `Chi tiết này đang khá gần gáy.`
4. **Sticker Safety Boundary:**
   - Fixed-shape stickers: 4% inset from shape boundary (circle, oval, rounded rectangle, etc.).
   - Die-cut stickers: 4% inset from physical cut contour / white border.
5. **Wrapping Paper:**
   - Pattern mode: Individual repeated motifs intentionally reach and cross tile boundaries; only customer-authored single motif content is evaluated.
   - Full-sheet mode: Outer 4% safe margin applied to important text/logos.

## 5. UI Presentation & Interaction
1. **Safe Area Guide Overlay (`design-canvas.tsx`):**
   - Subtle low-contrast dashed border (`border-dashed border-muted-foreground/30 pointer-events-none`).
   - Not an editable document layer: does not print, does not export, does not capture clicks or touch gestures.
   - **Contextual visibility:**
     - Fades in automatically when an important object is dragged or resized into the risk zone.
     - Can also be toggled on/off via the editor More menu (`Hiện vùng an toàn`).
2. **Contextual Risk Badge (`selection-overlay.tsx`):**
   - When an important object is selected and enters `near-edge` or `high-risk`:
     - Lightweight warning pill appears next to the selection boundary with warning icon: `⚠ Chi tiết này hơi sát mép` or `⚠ Chi tiết này có thể bị cắt mất`.
     - Non-blocking: user can continue dragging, resizing, or rotating freely without intrusive modals.
3. **No Undo History or Dirty State:**
   - Safe area state is completely derived from element geometry and product geometry.
   - Appearing/disappearing warnings do not generate history transactions.

## 6. Preflight Integration (State 33 Preparation)
- In `src/lib/product-state.ts`, `getPreflight` evaluates all important elements against the product's safe area geometry:
  - If any important element is in `near-edge`: produces `warning` preflight check with `elementId` and `surfaceId`.
  - If any important element is in `high-risk`: produces `error` preflight check with `elementId` and `surfaceId`.
  - Tap on preflight item navigates directly to that surface and selects that element.

## 7. Explicit Exclusions
- NO snap-to-safe-area or magnetic guides.
- NO automatic repositioning of user content.
- NO customer-facing bleed or trim distance inputs.
- NO rulers or prepress crop mark overlays in customer UI.
