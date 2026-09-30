# State 26: Card UX Design Specification

## Overview & Philosophy
The folded card customizer models the product as the customer experiences it physically, not as an imposition print sheet.
- Supported variants: `Ngang` (Horizontal) and `Dọc` (Vertical).
- Three customer surfaces: `Mặt trước` (`front`), `Bên trong` (`inside`), `Mặt sau` (`back`).
- The inside surface is a single continuous spread (`Bên trong`), divided visually by a non-printable fold guide (`Nếp gấp`).
- Surface navigation is pure Editor UI state; it never mutates document history or creates Undo entries.
- Production imposition, panel inversion, and rotation are strictly isolated from customer view.

---

## 1. Surfaces & Geometry Model

### 1.1 Surface Definitions
- `front` (`Mặt trước`): Single front cover panel. Default starting surface.
- `inside` (`Bên trong`): Opened card spread consisting of two adjacent halves (Left/Right for horizontal fold; or side-by-side spread according to product orientation). Full freedom to place elements across fold.
- `back` (`Mặt sau`): Single back cover panel. Valid when left completely blank.

### 1.2 Physical Geometry Derived from Product Definition
- Panel aspect ratio:
  - Horizontal variant: Landscape ratio per panel (e.g., 148mm × 105mm). Inside spread = 296mm × 105mm (aspect ratio ~ 2.819:1 or 2:1 side-by-side spread).
  - Vertical variant: Portrait ratio per panel (e.g., 105mm × 148mm). Inside spread = 210mm × 148mm (aspect ratio ~ 1.419:1 side-by-side opened).
- Orientation is fixed upon project creation/template selection; no casual runtime orientation toggle.

### 1.3 Fold Guide Specifications
- Visible only on `inside` surface in Editor canvas.
- Visual weight: subtle low-contrast dashed line (`border-dashed border-muted-foreground/30`).
- Subtle label: `Nếp gấp`.
- Non-printable: flagged as editor UI (`pointer-events-none`, excluded from export, preview texture, and order thumbnails).
- Non-restrictive: objects can freely cross the fold without snapping or auto-displacement.

---

## 2. Document & State Architecture

### 2.1 State Partitioning
- `DesignState.elements`: Each `CanvasElement` carries `surface?: 'front' | 'inside' | 'back'`. Defaults to `'front'` for backward compatibility.
- `activeCardSurface`: Transient editor UI state (`'front' | 'inside' | 'back'`). Kept in editor component state / URL hash, NOT inside `DesignState` document mutations.
- Switching surface:
  - Clears active object selection (`selectedId = null`).
  - Resets or fits viewport appropriately without writing to Undo history.
  - Triggers analytics: `card_surface_changed { surface: activeCardSurface }`.

### 2.2 Layers & Element Scoping
- Layers panel displays and reorders only elements where `element.surface === activeCardSurface`.
- Adding elements (Text, Image, Sticker, Shape) via Add menu automatically assigns `surface: activeCardSurface`.
- Grouping is restricted to elements on the same surface.

### 2.3 Undo / Redo & Autosave
- Undo / Redo applies document-wide across all surfaces. Reverting an action does NOT force a surface switch unless the edited element belongs to another surface.
- Autosave and order snapshots save all elements across all surfaces without data loss.

---

## 3. UI & Interaction (Impeccable & GSAP)

### 3.1 Surface Switcher Component (`CardSurfaceSwitcher`)
- Placed near top context below top navigation bar, centered, compact pill container.
- Segmented items: `Mặt trước`, `Bên trong`, `Mặt sau`.
- Sliding indicator animated with GSAP (`gsap.to(indicator, { x, width, duration: 0.25, ease: "power2.out" })`) respecting `prefers-reduced-motion`.
- Explicit tap interaction only; swipe-to-switch is banned to prevent conflict with canvas pan/zoom/drag gestures.

### 3.2 Empty States
- `front`: Standard editor empty state (`Thêm ảnh`, `Thêm chữ`, `Chọn mẫu`).
- `inside`: Subtle helper text `Thêm lời chúc, ảnh hoặc sticker.`
- `back`: Subtle helper text `Bạn có thể để trống hoặc thêm lời nhắn ở mặt sau.`

---

## 4. Templates & Preflight Integration
- Multi-surface template schema: templates can supply initial elements for `front`, `inside`, and `back`.
- Preflight:
  - Empty `inside` or `back` is valid and produces no errors.
  - Fold awareness: elements intersecting fold line are noted for State 33 warning without blocking completion in State 26.
