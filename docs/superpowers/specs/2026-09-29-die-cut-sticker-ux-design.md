# State 27: Die-cut Sticker UX Design Specification

## Overview & Philosophy
The Die-cut Sticker customizer allows non-designers on mobile devices to create custom stickers whose physical shape follows the combined silhouette of their visible artwork.
- Core principle: **"The customer designs the sticker. The application figures out how it should be cut."**
- The application automatically derives a single connected outer sticker shape with a default white border (2 mm).
- Technical production concepts (Bézier cutlines, spot color, bleed, overprint, anchor points, marching squares, DPI) are strictly hidden from customers.
- Live feedback assists users when elements are disconnected or when unremoved image backgrounds produce unwanted rectangular silhouettes.

---

## 1. Domain Model & Product Configuration

### 1.1 Product Options Schema
`StickerOptions` in `src/lib/product-state.ts`:
```ts
export interface StickerOptions {
  borderWidth: number;       // In mm; default 2 mm
  minBorderWidth?: number;   // 0 mm
  maxBorderWidth?: number;   // 6 mm
  hasWhiteBorder: boolean;   // default: true
  showCutline?: boolean;     // default: false (customer preview mode)
  cutLineMode?: 'die-cut' | 'fixed-shape' | 'phone';
  [key: string]: unknown;
}
```

### 1.2 Default Values
- `borderWidth`: 2 mm (mapped to proportional design units in canvas).
- `hasWhiteBorder`: `true`.
- `showCutline`: `false`.
- Configurable range: Min 0 mm, Max 6 mm, Default 2 mm stored in product definition.

---

## 2. Contour & Silhouette Engine (`src/lib/sticker-contour.ts`)

### 2.1 Pure Deterministic Pipeline
The silhouette engine operates in normalized design coordinates (independent of screen pixel density or viewport zoom):
1. **Element Bounds Extraction:** Collect all visible elements (`image`, `text`, `sticker`, `shape`, `group`). Transparent margins of background-removed assets are respected.
2. **Expansion & Union:** Expand each element boundary by the effective border offset (e.g. `hasWhiteBorder ? borderWidth : 0`).
3. **Connectivity Analysis (Connected Component Analysis):**
   - Build an adjacency graph of intersecting expanded bounds.
   - If components count > 1: status is `disconnected`.
   - As `borderWidth` increases, islands merge into 1 component; status automatically becomes `valid`.
4. **Background Assessment:**
   - Detect image elements with opaque rectangular aspect ratio that lack transparent alpha or background-removal derivation.
   - Flag `unremoved_background` hint: *"Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước."*
5. **Detail & Corner Check:**
   - Detect if design has elements or gaps below physical manufacturing threshold (< 1 mm).
   - Flag `tiny_details` hint: *"Một số chi tiết quá nhỏ để cắt đẹp."*
6. **Output Geometry:**
   - Unified SVG path string (`d="..."`) for the outer silhouette.
   - Vector cutline path for overlay rendering and future export.

### 2.2 Status Model
```ts
export type StickerContourStatus =
  | 'empty'
  | 'valid'
  | 'disconnected'
  | 'tiny-details';

export interface StickerContourResult {
  status: StickerContourStatus;
  islandCount: number;
  hasUnremovedBackground: boolean;
  borderSvgPath: string;
  cutlineSvgPath: string;
  warningMessage?: string;
  guidanceMessage?: string;
}
```

---

## 3. UI & Interaction (Mobile First)

### 3.1 Bottom Toolbar Integration
- When `productId === 'sticker'` and no element is selected (`!selectedId`):
  - Bottom toolbar displays an entry button: **Viền sticker** with a cut/border icon.
  - Tapping opens `StickerBorderSheet`.

### 3.2 Sticker Border Sheet (`StickerBorderSheet`)
A compact mobile bottom sheet containing:
- **Title:** `Viền sticker`
- **Toggle: Viền trắng** (`Switch` On/Off):
  - When Off: cutline follows artwork closely (0 mm border offset).
  - When On: uses slider thickness.
- **Slider: Độ dày viền:**
  - `Mỏng ─────●──── Dày`
  - Secondary label: `X mm` (e.g., `2 mm`).
  - Gesture updates canvas live without debounce stutter.
- **Toggle: Xem đường cắt** (`Switch` On/Off):
  - Toggles subtle cutline outline on canvas.
- **Status & Guidance Card:**
  - `✓ Hình cắt ổn`: Clean single connected sticker.
  - `⚠ Một số chi tiết đang tách rời`: *"Di chuyển chúng gần nhau hơn hoặc tăng viền để tạo thành một sticker."*
  - `⚠ Có chi tiết quá nhỏ`: *"Tăng viền hoặc đơn giản thiết kế."*
  - `Gợi ý xóa nền`: *"Muốn sticker cắt theo chủ thể? Hãy xóa nền ảnh trước."* + Nút hành động **Xóa nền**.

### 3.3 Canvas Presentation (`design-canvas.tsx`)
- The white border is rendered as a clean underlying SVG silhouette behind visible elements.
- When `showCutline` is active:
  - Renders a thin, subtle dashed stroke tracing the outer contour.
  - Layer is marked `pointer-events-none`, non-selectable, non-printable, not listed in Layers.

---

## 4. History, Transactions & Storage

### 4.1 History Transactions
- Sliders and toggle interactions create semantic history entries:
  - `'change-sticker-border'`: `Đổi độ dày viền sticker`
  - `'toggle-sticker-border'`: `Bật/tắt viền trắng sticker`
- One continuous slider drag session commits exactly ONE history entry on release.
- Toggling `showCutline` is transient UI state and does not create an undo history entry.

### 4.2 Storage & Serialization
- `StickerOptions` persists `borderWidth`, `hasWhiteBorder`, `showCutline` within `productOptions`.
- Derived contours and cutline overlays are purely generated: NEVER stored in `elements`, layers, or order line item payloads.

---

## 5. Exclusions for State 27 MVP
- No manual Bézier or vector anchor-point editing.
- No pen tool.
- No spot-color / printer technical registration mark setup.
- No automatic cutting of internal holes (outer silhouette only).
- No multiple sticker nesting / sticker sheet imposition.
