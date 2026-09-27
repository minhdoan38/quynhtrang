# Replace Image UX Design Specification (State 16)

**Target:** Mobile & Desktop Print Customizer Editor  
**Status:** Approved  
**Author:** Assistant & Engineering Team  
**Date:** 2026-09-27  

---

## 1. Executive Summary & Core Principle

**"Replace the image content, not the layout."**  
**"Preserve the container. Replace the content."**

Customers customizing stationery, cards, wrapping paper, and gift items frequently want to swap a placeholder or an existing personal photo for another image. They must feel:
> *"Tôi muốn đổi một bức ảnh khác vào đúng vị trí này."*

And never feel:
> *"Tôi phải xóa ảnh này đi rồi căn chỉnh lại bố cục từ đầu."*

---

## 2. Interaction Flow & Entry Point

### 2.1 Entry Point
1. The customer selects an image element on canvas (`selectedTarget === 'image'`).
2. The bottom contextual toolbar displays:
   `‹  Cắt  Thay ảnh  Xóa nền  Độ mờ  •••`
3. Tapping **`Thay ảnh`** opens the reusable **Image Source Chooser** in `replace` context.
4. `Thay ảnh` is never displayed as a generic creation action in top-level navigation.

### 2.2 Reusable Image Source Chooser
Rather than building duplicate file pickers, the editor uses a unified **Image Source Chooser** component parameterized by `ImageSourceContext`:
- `Thư viện ảnh` (`gallery`)
- `Chụp ảnh` (`camera`)
- `Chọn tệp` (`file`)

The sheet title and UX reflect the context:
- In `add` mode: Title is "Thêm ảnh", selecting creates a new `CanvasElement`.
- In `replace` mode: Title is "Thay ảnh", selecting targets the existing `selectedElementId`.
- Tapping **Đóng (X)**, swiping down, or pressing Back cancels the replace flow: no change occurs, and no history entry is created.

---

## 3. Data Model & Architecture

### 3.1 Explicit Image Source Context
```typescript
export type ImageSourceContext =
  | { mode: 'add' }
  | { mode: 'replace'; targetElementId: string };
```
*Rule:* The application must never infer `add` vs `replace` simply from whether an image happens to be selected. The intent is explicitly carried in state.

### 3.2 Preserved vs Reset Attributes
When an image is replaced, properties are partitioned into **Object-level Presentation** (preserved) and **Asset-specific Processing** (reset):

| Attribute | Category | Behavior on Replace |
|---|---|---|
| `id` | Geometry / Identity | **Preserved** (maintains DOM identity & references) |
| `x`, `y` | Geometry | **Preserved** (exact position on canvas) |
| `width`, `height` | Geometry / Frame | **Preserved** (frame dimensions never resize automatically) |
| `rotation` | Geometry | **Preserved** (e.g. 15° stays 15°) |
| `opacity` | Presentation | **Preserved** (e.g. 70% stays 70%) |
| `zIndex` | Stacking order | **Preserved** (exact layer position preserved) |
| `locked` | Permission | **Preserved** (locked template elements stay locked) |
| `mask` | Frame mask | **Preserved** (circle, heart, rounded rectangle intact) |
| `placeholder` | Template metadata | **Preserved / Cleared** (if placeholder was true, becomes customized) |
| `src` | Asset content | **Replaced** with new asset URL / blob |
| `originalSrc` | Asset content | **Replaced** with new raw asset URL |
| `assetId` | Asset reference | **Replaced** with new asset identifier |
| `sourceWidth`, `sourceHeight` | Asset dimensions | **Replaced** with new natural image dimensions |
| `crop` | Framing | **Reset to default cover + center crop** |
| `removedBackgroundSrc` | Asset processing | **Reset to undefined** (never inherits old alpha mask) |

### 3.3 Default Fit & Crop: COVER + Center Crop
1. **Aspect Ratio Preservation:** The new image may be portrait while the frame is landscape (or vice-versa). The frame does not stretch, distort, or resize.
2. **Cover:** The replacement image scales uniformly to completely cover the existing frame bounds.
3. **Center Crop:** Excess image area outside the frame bounds is centered and clipped.
4. **No Forced Crop Mode:** Do NOT force the user into crop mode upon replacement. Show the new image immediately on canvas.
5. `Cắt` remains immediately accessible on the contextual toolbar for optional fine-tuning.

---

## 4. History, Assets & Lifecycle

### 4.1 Single History Action
- Replacing an image creates **exactly one** semantic history transaction in `past`:
  - Action name: `Thay ảnh`
- Auto-cover, center-crop, and asset assignment occur synchronously as part of this single commit.
- Hitting **Hoàn tác (Undo)** restores the previous image, its original dimensions, and its previous crop/processing in exactly one step.

### 4.2 Non-Destructive Asset Preservation
- The previous image blob/URL is NOT revoked or deleted immediately upon replace, because Undo and history restoration must continue to render correctly.
- Blobs are only revoked when the project closes or when unreferenced by any undo/redo history state.

### 4.3 Cancel & Failure Rollback
- Closing the sheet without picking an image does nothing.
- If file decoding fails or the file is invalid:
  - Keep the original image completely intact in the frame.
  - Show user-friendly error toast:
    - `"Không thể sử dụng ảnh này. Hãy chọn ảnh khác."`
    - Or for invalid formats: `"Không thể sử dụng tệp này. Hãy chọn ảnh PNG, JPG hoặc định dạng được hỗ trợ."`
  - Do NOT flash empty/broken frames.

---

## 5. Image Quality & Preflight

### 5.1 Dynamic Recalculation
Immediately after successful replacement:
1. Re-evaluate image print quality with `evaluateImageQuality(...)` using the new source resolution and effective frame scale.
2. Dynamically update the quality indicator on the canvas selection overlay:
   - `✓ Ảnh đẹp` (>= 600 effective dpi/factor)
   - `⚠ Có thể hơi mờ` (300-599 effective)
   - `⚠ Ảnh quá nhỏ` (< 300)
3. Quality warnings do NOT block the replacement. The customer is permitted to keep the image.

---

## 6. Selection & Contextual Toolbar Continuity

Immediately after replacement commits:
1. The replaced image element remains **selected** (`selectedTarget === 'image'`).
2. Selection transform handles (corners, rotation stem) and quality badge remain visible.
3. The contextual toolbar restores:
   `‹  Cắt  Thay ảnh  Xóa nền  Độ mờ  •••`
4. Debounced autosave is triggered.

---

## 7. Explicit Non-Goals (Out of Scope)

- AI image replacement or automatic subject generation.
- Stock photo integration / third-party asset marketplaces.
- Automatic background removal on new assets.
- Face detection / AI focal point finding.
- Multiple candidate carousel preview before selection.
- Color filters or photographic adjustments.
