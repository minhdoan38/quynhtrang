# Replace Image UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a seamless mobile-first Replace Image experience for the customizer that swaps image content while strictly preserving object geometry, frame layout, masks, rotation, opacity, and layer stacking.

**Architecture:** Model the image element conceptually as a fixed container frame with swapable image content. Decouple selection intent into an explicit `ImageSourceContext` (`add` vs `replace`), share a single `ImageSourceChooser` component, compute automatic cover and center-crop defaults on the new asset, reset asset-specific processing (such as background removal), and commit exactly one atomic history transaction upon valid decode with zero-flash error rollback.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4, Node test runner (`node --test`), Lucide icons, GSAP for smooth modal transitions with reduced-motion support.

**Spec:** `docs/superpowers/specs/2026-09-27-replace-image-ux-design.md`

## Global Constraints

- Never infer `add` vs `replace` simply from whether an image element is currently selected; pass an explicit `ImageSourceContext`.
- Replace must strictly preserve: `x`, `y`, `width`, `height`, `rotation`, `opacity`, `zIndex`, `locked`, `mask`, and `id`.
- Frame dimensions must not resize or distort when replacing an image with different aspect ratios (e.g. landscape to portrait); default to uniform `cover` and center crop.
- Never automatically carry over background-removal derived assets (`removedBackgroundSrc`) to a newly replaced image.
- Never immediately revoke or destroy replaced image blobs if they remain referenced by undo/redo history.
- Errors during decoding or file validation must preserve the incumbent image completely intact without flashing broken frames or blank canvases.
- Completed replace must create exactly one semantic history entry in `past`, and Undo must revert to the previous image in one step.
- Selection must remain active on the replaced image with transform handles and the contextual toolbar (`‹  Cắt  Thay ảnh  Xóa nền  Độ mờ  •••`) immediately available.

## Review Focus

1. Replacing a landscape photo with an extreme portrait photo maintains the exact frame boundaries without stretching or shrinking the canvas container.
2. Replacing an image with a non-image or corrupted file shows a Vietnamese friendly error and leaves the original image completely intact.
3. Replacing an image that previously had its background removed resets to the new raw asset without inheriting phantom cutouts.
4. Replacing an image inside a shaped mask (circle, heart, rounded) displays the new photo clipped inside the same mask.
5. Hitting Undo immediately after replacing an image restores the previous image and its dimensions in exactly one step.

---

### Task 1: Domain Logic, Cover-Crop Math & Reducer Preservations

**Files:**
- Create: `src/lib/image-replacement.ts`
- Modify: `src/lib/product-state.ts:1094-1146`
- Create: `src/test/image-replacement.test.ts`
- Modify: `src/test/product-state.test.ts:377-412`

**Interfaces:**
- Consumes: `CanvasElement`, `ImageObjectData`, `ImageCropData`, `DesignState` from `src/lib/product-state.ts`.
- Produces:
  ```typescript
  export interface CalculateCoverCropParams {
    frameWidth: number;
    frameHeight: number;
    imageWidth: number;
    imageHeight: number;
  }
  export function calculateCoverCrop(params: CalculateCoverCropParams): ImageCropData;
  export function replaceImageInState(
    state: DesignState,
    targetId: string,
    newAsset: {
      id?: string;
      src: string;
      originalSrc?: string;
      name?: string;
      width?: number;
      height?: number;
      size?: number;
    }
  ): DesignState;
  ```

- [ ] **Step 1: Write failing tests for image replacement domain logic**

```typescript
// src/test/image-replacement.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCoverCrop, replaceImageInState } from '../lib/image-replacement.ts';
import { createInitialState, transitionState, type CanvasElement } from '../lib/product-state.ts';

test('calculateCoverCrop computes centered crop for portrait image in landscape frame', () => {
  const crop = calculateCoverCrop({
    frameWidth: 200,
    frameHeight: 100, // 2:1 landscape
    imageWidth: 100,
    imageHeight: 200, // 1:2 portrait
  });
  assert.equal(crop.width, 100);
  assert.equal(crop.height, 50);
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 75); // Centered vertically
});

test('calculateCoverCrop computes centered crop for landscape image in square frame', () => {
  const crop = calculateCoverCrop({
    frameWidth: 100,
    frameHeight: 100,
    imageWidth: 200,
    imageHeight: 100,
  });
  assert.equal(crop.width, 100);
  assert.equal(crop.height, 100);
  assert.equal(crop.x, 50); // Centered horizontally
  assert.equal(crop.y, 0);
});

test('replaceImageInState preserves layout, mask, rotation, and resets background removal', () => {
  const base = createInitialState('card');
  const existingElement: CanvasElement = {
    id: 'image-target',
    type: 'image',
    x: 40,
    y: 30,
    width: 120,
    height: 80,
    rotation: 25,
    locked: false,
    zIndex: 3,
    data: {
      src: 'blob:old-processed.png',
      originalSrc: 'blob:old-original.jpg',
      removedBackgroundSrc: 'blob:old-processed.png',
      name: 'old.jpg',
      opacity: 80,
      mask: 'circle',
      sourceWidth: 800,
      sourceHeight: 600,
    },
  };
  const stateWithImage = { ...base, elements: [existingElement] };

  const nextState = replaceImageInState(stateWithImage, 'image-target', {
    id: 'asset-new-1',
    src: 'blob:new-raw.jpg',
    name: 'portrait.jpg',
    width: 600,
    height: 1200,
  });

  const replacedEl = nextState.elements?.find((el) => el.id === 'image-target')!;
  assert.ok(replacedEl);
  // Preserved properties
  assert.equal(replacedEl.id, 'image-target');
  assert.equal(replacedEl.x, 40);
  assert.equal(replacedEl.y, 30);
  assert.equal(replacedEl.width, 120);
  assert.equal(replacedEl.height, 80);
  assert.equal(replacedEl.rotation, 25);
  assert.equal(replacedEl.zIndex, 3);
  assert.equal(replacedEl.data?.mask, 'circle');
  assert.equal(replacedEl.data?.opacity, 80);

  // Replaced & Reset properties
  assert.equal(replacedEl.data?.src, 'blob:new-raw.jpg');
  assert.equal(replacedEl.data?.originalSrc, 'blob:new-raw.jpg');
  assert.equal(replacedEl.data?.removedBackgroundSrc, undefined);
  assert.equal(replacedEl.data?.sourceWidth, 600);
  assert.equal(replacedEl.data?.sourceHeight, 1200);
  assert.ok(replacedEl.data?.crop);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/image-replacement.test.ts`  
Expected: FAIL (Cannot find module `../lib/image-replacement.ts`).

- [ ] **Step 3: Implement `src/lib/image-replacement.ts` and sync `src/lib/product-state.ts`**

```typescript
// src/lib/image-replacement.ts
import type { ImageCropData, DesignState, CanvasElement, ImageObjectData } from './product-state';

export interface CalculateCoverCropParams {
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
}

export function calculateCoverCrop({
  frameWidth,
  frameHeight,
  imageWidth,
  imageHeight,
}: CalculateCoverCropParams): ImageCropData {
  const safeFrameW = Math.max(1, frameWidth);
  const safeFrameH = Math.max(1, frameHeight);
  const safeImgW = Math.max(1, imageWidth);
  const safeImgH = Math.max(1, imageHeight);

  const frameAspect = safeFrameW / safeFrameH;
  const imageAspect = safeImgW / safeImgH;

  let cropW: number;
  let cropH: number;

  if (imageAspect > frameAspect) {
    // Image is wider than frame -> height matches, crop left/right
    cropH = safeImgH;
    cropW = Math.round(safeImgH * frameAspect);
  } else {
    // Image is taller than frame -> width matches, crop top/bottom
    cropW = safeImgW;
    cropH = Math.round(safeImgW / frameAspect);
  }

  const cropX = Math.max(0, Math.round((safeImgW - cropW) / 2));
  const cropY = Math.max(0, Math.round((safeImgH - cropH) / 2));

  return {
    x: cropX,
    y: cropY,
    width: cropW,
    height: cropH,
  };
}

export function replaceImageInState(
  state: DesignState,
  targetId: string,
  newAsset: {
    id?: string;
    src: string;
    originalSrc?: string;
    name?: string;
    width?: number;
    height?: number;
    size?: number;
  }
): DesignState {
  const elements = state.elements ?? [];
  const target = elements.find((el) => el.id === targetId && el.type === 'image');
  if (!target) return state;

  const existingData = (target.data ?? {}) as ImageObjectData;
  const frameWidth = target.width || 60;
  const frameHeight = target.height || 60;
  const imgWidth = newAsset.width || 800;
  const imgHeight = newAsset.height || 800;

  const defaultCrop = calculateCoverCrop({
    frameWidth,
    frameHeight,
    imageWidth: imgWidth,
    imageHeight: imgHeight,
  });

  const updatedData: ImageObjectData = {
    ...existingData,
    src: newAsset.src,
    originalSrc: newAsset.originalSrc ?? newAsset.src,
    removedBackgroundSrc: undefined, // Reset derived background removal
    name: newAsset.name ?? existingData.name ?? 'Ảnh đã thay thế',
    assetId: newAsset.id ?? existingData.assetId,
    sourceWidth: newAsset.width,
    sourceHeight: newAsset.height,
    crop: defaultCrop,
    placeholder: false,
  };

  const nextElements = elements.map((el) =>
    el.id === targetId ? { ...el, data: updatedData as unknown as Record<string, unknown> } : el
  );

  return {
    ...state,
    image: {
      name: newAsset.name ?? state.image?.name ?? 'Ảnh đã thay thế',
      src: newAsset.src,
      width: newAsset.width ?? state.image?.width,
      height: newAsset.height ?? state.image?.height,
      size: newAsset.size ?? state.image?.size,
    },
    elements: nextElements,
  };
}
```

Update `REPLACE_IMAGE_ASSET` in `src/lib/product-state.ts` to delegate to `replaceImageInState`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --experimental-strip-types src/test/image-replacement.test.ts src/test/product-state.test.ts`  
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit changes**

```bash
git add src/lib/image-replacement.ts src/lib/product-state.ts src/test/image-replacement.test.ts src/test/product-state.test.ts
git commit -m "feat(image): add cover crop calculation and non-destructive image replacement state transition"
```

---

### Task 2: Reusable Image Source Chooser Component

**Files:**
- Create: `src/components/customizer/image-source-chooser.tsx`
- Modify: `src/lib/add-content.ts:30-40`
- Modify: `src/components/customizer/add-content-sheet.tsx:216-270`
- Modify: `src/test/add-content.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type ImageSourceContext =
    | { mode: 'add' }
    | { mode: 'replace'; targetElementId: string };

  export interface ImageSourceChooserProps {
    context: ImageSourceContext;
    onSelectSource: (source: ImageSourceType, context: ImageSourceContext) => void;
    onClose: () => void;
    onBack?: () => void;
  }
  ```

- [ ] **Step 1: Write test for `ImageSourceContext` in `src/test/add-content.test.ts`**

```typescript
test('ImageSourceContext supports explicit add and replace modes', () => {
  const addCtx: ImageSourceContext = { mode: 'add' };
  const replaceCtx: ImageSourceContext = { mode: 'replace', targetElementId: 'image-1' };
  assert.equal(addCtx.mode, 'add');
  assert.equal(replaceCtx.mode, 'replace');
  assert.equal((replaceCtx as { targetElementId: string }).targetElementId, 'image-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/add-content.test.ts`  
Expected: FAIL (Cannot find `ImageSourceContext`).

- [ ] **Step 3: Implement `src/components/customizer/image-source-chooser.tsx`**

Build clean, accessible source options with icons (`ImageIcon`, `Camera`, `FolderOpen`):
- `Thư viện ảnh` (Photo library)
- `Chụp ảnh` (Camera)
- `Chọn tệp` (File upload)
Respect `context.mode`:
- In `replace` mode: title is "Thay ảnh", includes subtle helper "Giữ nguyên vị trí và khung thiết kế".
- In `add` mode: title is "Thêm ảnh".
Add accessible buttons with `44px` height and clear Vietnamese descriptions.

- [ ] **Step 4: Integrate `ImageSourceChooser` into `add-content-sheet.tsx`**

Replace inline source list inside `add-content-sheet.tsx` with the unified `<ImageSourceChooser context={{ mode: 'add' }} ... />`.

- [ ] **Step 5: Run tests and typecheck**

Run: `node --test --experimental-strip-types src/test/add-content.test.ts && pnpm typecheck`  
Expected: PASS (0 errors).

- [ ] **Step 6: Commit changes**

```bash
git add src/lib/add-content.ts src/components/customizer/image-source-chooser.tsx src/components/customizer/add-content-sheet.tsx src/test/add-content.test.ts
git commit -m "feat(image): create unified ImageSourceChooser with explicit add and replace context"
```

---

### Task 3: Customizer Shell Integration, History Batching & Error Rollback

**Files:**
- Modify: `src/components/customizer/editor-sheets.tsx:35-80,165-215`
- Modify: `src/components/customizer/customizer-shell.tsx:580-628,900-910,1430-1440`
- Modify: `src/lib/upload.ts`

**Interfaces:**
- Consumes: `ImageSourceChooser`, `ImageSourceContext`, `replaceImageInState`.
- Produces: Complete Replace Image user flow wired to contextual toolbar `Thay ảnh`.

- [ ] **Step 1: Write integration tests for upload error rollback and replace flow**

Create `src/test/replace-image-flow.test.ts`:
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceImageInState } from '../lib/image-replacement.ts';
import { createInitialState } from '../lib/product-state.ts';

test('replaceImageInState does not corrupt state if target element does not exist', () => {
  const base = createInitialState('wrapping');
  const next = replaceImageInState(base, 'non-existent-id', {
    src: 'blob:something.jpg',
  });
  assert.deepEqual(next, base);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/replace-image-flow.test.ts`  
Expected: PASS.

- [ ] **Step 3: Update `customizer-shell.tsx` and `editor-sheets.tsx`**

1. Add explicit `imageSourceContext` state to `customizer-shell.tsx`:
   ```typescript
   const [imageSourceContext, setImageSourceContext] = useState<ImageSourceContext>({ mode: 'add' });
   ```
2. When customer clicks `Thay ảnh` in bottom navigation:
   ```typescript
   case 'replace-image': {
     const targetId = selectedElementId || (state.elements?.find(e => e.type === 'image')?.id) || 'image-1';
     setImageSourceContext({ mode: 'replace', targetElementId: targetId });
     setActiveSheet('image-source');
     break;
   }
   ```
3. When customer clicks `Thêm → Ảnh`:
   ```typescript
   setImageSourceContext({ mode: 'add' });
   ```
4. Update `handleUploadImage`:
   - Keep old image in DOM while loading new asset.
   - On valid decode:
     - Push current `state` to `past` history (`setPast(prev => [...prev, state])`).
     - Clear `future` redo history.
     - Dispatch `REPLACE_IMAGE_ASSET` or call `replaceImageInState`.
     - Ensure `selectedTarget` remains `'image'` and `selectedElementId` remains `targetId`.
     - Show toast: `"Đã thay ảnh (giữ nguyên khung thiết kế)."`.
   - On error:
     - Do not mutate state.
     - Do not add history entry.
     - Show toast: `"Không thể sử dụng ảnh này. Hãy chọn ảnh khác."`.
5. Support `ActiveSheetType = ... | 'image-source'` in `editor-sheets.tsx` using `ImageSourceChooser`.

- [ ] **Step 4: Run typecheck and full test suite**

Run: `pnpm typecheck && pnpm test`  
Expected: PASS (85+ tests pass, 0 type errors).

- [ ] **Step 5: Commit changes**

```bash
git add src/components/customizer/customizer-shell.tsx src/components/customizer/editor-sheets.tsx src/test/replace-image-flow.test.ts
git commit -m "feat(customizer): wire Replace Image flow with explicit source context and atomic undo commit"
```

---

### Task 4: Dynamic Quality Recalculation & Canvas Crop Rendering

**Files:**
- Modify: `src/components/customizer/design-canvas.tsx:300-320,350-375`
- Modify: `src/lib/image-quality.ts:11-45`
- Modify: `src/test/image-quality.test.ts`

**Interfaces:**
- Consumes: `ImageQualityReport`, `evaluateImageQuality`, `getImageData`.
- Produces: Accurate live quality badge on canvas after replacement without blocking.

- [ ] **Step 1: Write test for quality recalculation with crop fraction**

```typescript
// src/test/image-quality.test.ts
test('evaluateImageQuality updates level when source dimensions change', () => {
  const highRes = evaluateImageQuality({ sourceWidth: 2400, sourceHeight: 1800, scale: 1 });
  assert.equal(highRes.level, 'good');

  const lowRes = evaluateImageQuality({ sourceWidth: 400, sourceHeight: 300, scale: 1 });
  assert.equal(lowRes.level, 'critical');
  assert.equal(lowRes.badgeLabel, 'Ảnh quá nhỏ');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/image-quality.test.ts`  
Expected: PASS.

- [ ] **Step 3: Update `design-canvas.tsx` for cover and crop rendering**

1. Read `imgData.crop` and natural image dimensions:
   - When rendered in canvas, container frame uses `overflow-hidden` with `object-fit: cover` or CSS clip rect corresponding to the computed crop.
   - If mask is present (e.g. `mask: 'circle'`), apply clip-path / border-radius to outer frame so replacement photo inherits the exact mask geometry.
2. In `design-canvas.tsx`, pass updated source dimensions and crop fraction to `evaluateImageQuality`:
   ```typescript
   const imageQuality = useMemo<ImageQualityReport | null>(() => {
     if (!image?.src) return null;
     const cropFraction = imgData?.crop
       ? (imgData.crop.width * imgData.crop.height) / ((imgData.sourceWidth || 800) * (imgData.sourceHeight || 800))
       : 1;
     return evaluateImageQuality({
       sourceWidth: imgData?.sourceWidth ?? image.width ?? 1200,
       sourceHeight: imgData?.sourceHeight ?? image.height ?? 1200,
       scale: effectiveImageTransform.scale,
       cropFraction: Math.max(0.1, cropFraction),
       productId,
     });
   }, [image?.src, imgData, effectiveImageTransform.scale, productId]);
   ```

- [ ] **Step 4: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/components/customizer/design-canvas.tsx src/test/image-quality.test.ts
git commit -m "feat(canvas): render covered crop and dynamically recalculate quality badge on image replacement"
```

---

### Task 5: Full Verification, Mechanical Quality & Browser Smoke Tests

**Files:**
- Verification only (typecheck, tests, build, Impeccable detector, browser session).

- [ ] **Step 1: Run TypeScript check, unit test suite, and production build**

Run: `pnpm run typecheck && pnpm test && pnpm build`  
Expected: 0 TypeScript errors, 86+ unit tests passing, production build succeeded.

- [ ] **Step 2: Run Impeccable Mechanical Detector**

Run: `node /Users/minhmice/.agents/skills/impeccable/scripts/detect.mjs --json src/components/customizer/image-source-chooser.tsx src/components/customizer/add-content-sheet.tsx src/components/customizer/editor-sheets.tsx src/components/customizer/customizer-shell.tsx src/components/customizer/design-canvas.tsx`  
Expected: `[]` (0 findings).

- [ ] **Step 3: Run Headless Browser Smoke Test on Mobile (390×844)**

Launch server on port 3014:
1. Load editor with an existing image on canvas.
2. Verify image is selected with transform handles and quality badge.
3. Tap `Thay ảnh` on the contextual toolbar.
4. Verify `ImageSourceChooser` opens with title "Thay ảnh" and options: Thư viện ảnh, Chụp ảnh, Chọn tệp.
5. Tap Cancel/Close `×` -> Verify original image stays untouched, no history entry created.
6. Tap `Thay ảnh` -> Choose new image (portrait).
7. Verify new image appears in exact same canvas frame and position.
8. Verify mask, opacity, and rotation are preserved.
9. Verify quality badge updates immediately.
10. Tap `Hoàn tác` (Undo) -> Verify previous image is completely restored in exactly one step.
11. Confirm 0 console errors.

- [ ] **Step 4: Run Headless Browser Smoke Test on Desktop (1280×800)**

1. Verify layout adapts cleanly without distortion.
2. Confirm Replace Image functions identically on desktop viewport.
3. Stop test server and close browser tabs.

- [ ] **Step 5: Commit all remaining verification files and documentation**

```bash
git add docs/superpowers/plans/2026-09-27-replace-image-ux.md
git commit -m "docs(plan): complete implementation plan for Replace Image UX (State 16)"
```
