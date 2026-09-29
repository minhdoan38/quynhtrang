# State 29: Notebook Cover UX Design Specification

## Overview & Philosophy
The Notebook Cover customizer allows non-designers on mobile devices to personalize a physical notebook front cover.
- Core principle: **"Notebook Cover should feel like the simplest product in the editor: one fixed canvas, design the front, preview the notebook."**
- Exactly one editable surface: `Bìa trước`. No surface switcher, no spine canvas, no inside-page editor.
- Fixed physical size: A5 standard (148mm × 210mm portrait, aspect ratio ~0.705).
- Direct zero-friction entry: Tapping `Tự thiết kế` enters the front cover editor directly without redundant size picker modals.
- Flat design canvas with subtle physical cues (book spine indicator on left edge, rounded outer corners `rounded-r-xl rounded-l-xs`).
- A subtle non-printable binding guide (`Vùng gần gáy`) helps keep important text/faces away from the spiral/book spine without blocking edge-to-edge artwork.
- Standard editor reuse: text, photos, stickers, shapes, background color, replace, crop, remove background, mask, layers, undo/redo.

---

## 1. Domain Model & Product Configuration

### 1.1 Product Definition & Geometry
In `src/lib/product-state.ts`:
```ts
export interface NotebookCoverDefinition {
  widthMm: number;        // 148 mm
  heightMm: number;       // 210 mm
  aspectRatio: number;    // 148 / 210 ≈ 0.70476
  bindingMarginMm: number;// 18 mm (left edge caution zone)
  bindingMarginPct: number;// ≈ 12%
}

export const NOTEBOOK_COVER_DEFINITION: Readonly<NotebookCoverDefinition> = Object.freeze({
  widthMm: 148,
  heightMm: 210,
  aspectRatio: 148 / 210,
  bindingMarginMm: 18,
  bindingMarginPct: 12,
});

export function isElementInNotebookBindingZone(
  element: { x: number; width?: number },
  canvasWidth: number = 100
): boolean {
  // If element is placed within the left 12% binding margin
  const elementX = element.x;
  return elementX < canvasWidth * 0.12;
}
```

### 1.2 Product Options
```ts
export interface NotebookOptions {
  finish?: 'matte' | 'glossy';
  backgroundColor?: string;
  [key: string]: unknown;
}
```

---

## 2. Canvas & Binding Guide Presentation

### 2.1 Front Cover Canvas (`design-canvas.tsx`)
- When `productId === 'notebook'`:
  - Canvas container maintains portrait aspect ratio: `aspectRatio: 148 / 210`.
  - Realistic notebook styling:
    - Subtle book spine shadow on the left edge.
    - Outer book corners: `rounded-r-xl rounded-l-xs`.
    - Box shadow simulating a rigid physical cover: `box-shadow: -6px 0 0 #2A2622, 0 16px 32px rgba(0,0,0,0.18);`.
  - Non-printable Binding Guide (`Vùng gần gáy`):
    - Positioned at left 12% of the canvas.
    - Visual weight: subtle low-contrast dashed line (`border-l border-dashed border-[#743021]/30`).
    - Subtle label: `Vùng gần gáy`.
    - Flagged as UI overlay: `data-ui-guide="notebook-binding"`, `pointer-events-none`, non-selectable, excluded from prints/exports.
    - Non-restrictive: full-cover photos and background colors freely cross the binding guide edge-to-edge.

---

## 3. Navigation & Toolbar Integration

### 3.1 Direct Entry Flow
- `ProductSetup`: Selecting Notebook Cover and clicking `Tự thiết kế` enters the editor canvas directly. No size picker modals.
- Selecting a notebook template applies it directly onto the cover canvas.

### 3.2 Bottom Toolbar Actions (`bottom-navigation.tsx`)
- When `productId === 'notebook'`:
  - Shows standard adaptive bottom navigation.
  - When no element is selected (`!selectedId`), shows `Màu nền` (Palette icon) to let the customer change the cover background color directly via the Color Sheet (State 19).
  - No surface switcher, no size changer, no contour controls.

---

## 4. Quality Checker & Preflight Rules

### 4.1 Image Quality Evaluation
- Evaluates source image resolution against physical A5 dimensions ($148 \times 210\text{ mm}$).
- Full-cover image stretch on low-resolution assets triggers standard `⚠ Có thể hơi mờ`.

### 4.2 Preflight Validation (`getPreflight`)
- Empty design check:
  - If cover has no elements and default white background:
    `warning: Bìa vở chưa có nội dung` ("Thêm hình ảnh, chữ hoặc sticker để bìa sổ sinh động hơn.").
- Binding caution check:
  - If text element is inside the left 12% binding margin:
    `warning: Văn bản nằm gần mép gáy sổ` ("Giữ chữ quan trọng cách mép này một chút để không bị che bởi gáy hoặc lỗ lò xo.").

---

## 5. Physical Mockup Preview Integration

### 5.1 Preview Renderer
- Flat cover design is rendered onto physical notebook mockup (notebook spine/spiral, book thickness, subtle cover highlights/shadows).
- Editor remains flat and clean; perspective simulation belongs solely to Preview mode.
