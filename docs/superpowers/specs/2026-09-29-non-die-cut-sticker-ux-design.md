# State 28: Non-die-cut Sticker UX Design Specification

## Overview & Philosophy
The Non-die-cut Sticker customizer allows customers to design custom stickers with predefined physical geometric shapes.
- Core principle: **"Choose the sticker shape first, then design inside that shape."**
- Supported shapes: `Tròn` (`circle`), `Vuông` (`square`), `Chữ nhật` (`rectangle`), `Oval` (`oval`), `Bo góc` (`rounded-rectangle`).
- The sticker shape is physical product geometry, NOT a normal editable shape element in Layers.
- The canvas visibly matches the selected physical shape with clean clipping (`overflow-hidden`).
- Completely separated from the Die-cut contour pipeline: NO contour extraction, NO automatically generated white border, NO `Xem đường cắt` tool, NO disconnected artwork warnings, NO tiny cut-detail warnings.

---

## 1. Domain Model & Product Configuration

### 1.1 Fixed Shapes Schema
In `src/lib/product-state.ts`:
```ts
export type FixedStickerShape = 'circle' | 'square' | 'rectangle' | 'oval' | 'rounded-rectangle';

export const FIXED_STICKER_SHAPES: readonly FixedStickerShape[] = [
  'circle',
  'square',
  'rectangle',
  'oval',
  'rounded-rectangle',
] as const;

export function getFixedStickerShapeLabel(shape: FixedStickerShape): string {
  switch (shape) {
    case 'circle': return 'Tròn';
    case 'square': return 'Vuông';
    case 'rectangle': return 'Chữ nhật';
    case 'oval': return 'Oval';
    case 'rounded-rectangle': return 'Bo góc';
  }
}
```

### 1.2 Sticker Options Extension
```ts
export interface StickerOptions {
  shape?: FixedStickerShape; // default: 'circle' when variant is 'fixed-shape'
  borderWidth: number;       // For die-cut
  minBorderWidth?: number;
  maxBorderWidth?: number;
  hasWhiteBorder: boolean;
  showCutline?: boolean;
  cutLineMode?: 'die-cut' | 'fixed-shape' | 'phone';
  [key: string]: unknown;
}
```

### 1.3 Physical Geometry Definitions
```ts
export interface FixedStickerDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  borderRadiusCss: string;
  isEllipse?: boolean;
}

export function getFixedStickerDimensions(shape: FixedStickerShape): FixedStickerDimensions {
  switch (shape) {
    case 'circle':
      return { width: 50, height: 50, aspectRatio: 1, borderRadiusCss: '9999px' };
    case 'square':
      return { width: 50, height: 50, aspectRatio: 1, borderRadiusCss: '0px' };
    case 'rectangle':
      return { width: 70, height: 50, aspectRatio: 70 / 50, borderRadiusCss: '0px' };
    case 'oval':
      return { width: 70, height: 50, aspectRatio: 70 / 50, borderRadiusCss: '50%', isEllipse: true };
    case 'rounded-rectangle':
      return { width: 70, height: 50, aspectRatio: 70 / 50, borderRadiusCss: '16px' };
  }
}
```

---

## 2. Setup Flow & Shape Selection

### 2.1 Blank Project Creation (`ProductSetup`)
- When customer selects the `fixed-shape` variant in `ProductSetup` and clicks `Tự thiết kế`:
  - Open a visual modal / picker: `Bạn muốn sticker hình gì?`
  - Display 5 visual cards with shape previews and customer-friendly labels:
    - `Tròn` (Circle)
    - `Vuông` (Square)
    - `Chữ nhật` (Rectangle)
    - `Oval` (Oval)
    - `Bo góc` (Rounded Rectangle)
  - Selecting a shape opens the Editor canvas in that exact geometry immediately.

### 2.2 Template Compatibility & Routing
- Templates declare supported shape (e.g. `productOptions: { sticker: { shape: 'circle' } }`).
- Applying a template applies the shape directly without asking the customer again.
- Template browser filters templates according to the active shape if already configured.

---

## 3. Canvas Rendering & UI Boundaries

### 3.1 Physical Canvas Presentation (`design-canvas.tsx`)
- When `productId === 'sticker' && variantId === 'fixed-shape'`:
  - Apply the physical shape's aspect-ratio and border-radius to the canvas container.
  - Apply `overflow-hidden` so off-boundary content is clipped cleanly at the physical cut edge.
  - The outer area is subtly dimmed / neutral workspace.
  - Physical boundary is clearly delineated by product border/shadow; NO technical cutline tool is shown.
  - The background color (`backgroundColor`) fills the physical sticker shape.

### 3.2 Bottom Toolbar Actions
- For `fixed-shape`:
  - `Viền sticker` is NOT displayed (only relevant for die-cut).
  - Show `Màu nền` (Color button) on the bottom toolbar when no element is selected, opening the background color sheet.

---

## 4. Preflight & Quality Rules

### 4.1 Strict Independence from Die-cut
- For `fixed-shape` stickers:
  - Do NOT run contour extraction.
  - Disconnected elements are 100% valid (no `Một số chi tiết đang tách rời` warning).
  - Tiny details do not trigger contour warnings.
  - Preflight validates:
    - Non-empty design content.
    - Image print resolution (`⚠ Có thể hơi mờ` if scaled too large).

---

## 5. Storage & History
- Selected `shape` is stored in `productOptions.shape`.
- Background color changes create a single semantic history entry.
- Shape is fixed during the editor session (no accidental shape-switching destroying layout).
