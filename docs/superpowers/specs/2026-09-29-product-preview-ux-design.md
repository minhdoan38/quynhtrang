# State 32: Product Preview Mode UX Design Specification

## 1. Overview & Core Philosophy
The Product Preview Mode exists to help the customer answer one question:
**“Sản phẩm thật của mình sẽ trông như thế nào?”**
- Guiding principle: **"Editor shows the design. Preview shows the product."**
- Preview is **NOT another editing screen**:
  - Entirely **read-only**: no object selection, moving, resizing, text/color changing.
  - Removes 100% of editing chrome: bounding boxes, resize/rotate handles, Safe Area guides, dashed fold guides, selection highlights, Layers, Add toolbar, cutline editing guides, and quality badges.
  - Presents the current design in a realistic, product-aware visual context.
- Dedicated full-screen Editor mode (`PREVIEW_MODE`):
  - Enters via universal bottom toolbar action `Xem thử`.
  - Exits via `Tiếp tục chỉnh` (returns to Editor with state preserved) or `Xong` (advances to Preflight).
  - Browser/system Back returns cleanly to Editor.
- Transient UI state: does not create Undo/Redo history, does not trigger autosave mutation.

## 2. Shared Preview Shell (`preview-shell.tsx`)
- **Header:**
  - Minimal navigation: `← Xem thử`.
  - Product badge: `<Tên sản phẩm> · <Biến thể/Kích thước>`.
- **Main Stage:**
  - Centered physical product mockup with realistic perspective, subtle drop shadows, and clean neutral background.
  - Safe against white artwork/stickers (soft warm neutral background `#F8F3E8`).
  - Pinch-zoom and pan enabled without modifying design dimensions.
- **Contextual View Switcher:**
  - Segmented control displayed only when the product supports multiple views:
    - **Giấy gói quà (Wrapping Paper):** `[ Tờ giấy ] [ Hộp quà ]`
    - **Thiệp gấp (Card):** `[ Đóng ] [ Mở ] [ Mặt sau ]`
    - **Sticker / Bìa sổ:** No superfluous switcher; focused directly on the physical product mockup.
- **Footer Actions:**
  - `[ Tiếp tục chỉnh ]` (variant: outline/secondary) -> closes preview, returns to Editor.
  - `[ Xong ]` (variant: primary `#315F86`) -> closes preview, opens Preflight check.

## 3. Product-Specific Mockup Renderers

### A. Giấy gói quà (Wrapping Paper)
- **`Tờ giấy` (Flat Sheet):**
  - Renders complete A1/A2 sheet.
  - Pattern Mode: renders deterministic repeat matrix (`Đều`, `So le dọc`, `So le ngang`, `Gương`), pattern scale, spacing, rotation, and background color.
  - Full Sheet Mode: renders full-sheet design.
- **`Hộp quà` (Gift Box Mockup):**
  - Lightweight 3D perspective box (CSS 3D transforms: front, top, side faces).
  - Preserves exact physical pattern scale mapped onto box faces.

### B. Thiệp chúc mừng (Card)
- Context-sensitive default view:
  - If editing Inside surface -> defaults to `Mở`.
  - If editing Front surface -> defaults to `Đóng`.
- **`Đóng` (Closed):** Front cover panel in realistic paper perspective with subtle right-edge page shadow.
- **`Mở` (Open Spread):** Full two-page inside spread with a subtle vertical crease/gradient shadow along the center fold instead of a dashed editor guide.
- **`Mặt sau` (Back):** Back cover panel preview.

### C. Hình dán (Sticker - Die-cut & Fixed-shape)
- Isolated physical sticker on a clean neutral background.
- **Die-cut:**
  - Displays generated contour silhouette and white sticker border.
  - Hides technical production cutline guide (`showCutline` is suppressed).
  - Soft realistic drop shadow outlining the physical sticker border.
- **Fixed-shape:**
  - Exact physical shape clipping: Circle, Square, Rectangle, Oval, Rounded Rectangle.

### D. Bìa sổ tay (Notebook Cover)
- Renders A5 front cover artwork mapped onto a physical notebook mockup.
- Features realistic physical binding (spiral / stitched binding edge on the left margin) with soft paper page depth and drop shadow.
- Omits the dashed editor binding line guide.

## 4. Performance & Reliability
- Uses lightweight CSS 3D transforms, SVG paths, and compositing (no heavy WebGL/Three.js dependencies).
- Fallback gracefully: if a mockup fails, renders a clean flat product preview with notification.
- Motion accessibility: respects `prefers-reduced-motion` for transitions.
