# Mobile Text Editing UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current full-screen text editing shortcut with a generic, mobile-first text object flow: add text → type immediately → finish → format selected text.

**Architecture:** Move text rendering and mutation to `CanvasElement` text nodes while retaining legacy top-level text fields for saved-state compatibility. Keep `CustomizerShell` as the editor state coordinator, add a focused textarea overlay for `TEXT_EDITING`, and keep `DesignCanvas`, `BottomNavigation`, and `EditorSheets` responsible for canvas interaction and post-edit formatting. Use reducer actions for semantic document changes and keep existing debounced autosave/history infrastructure.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, existing shadcn Drawer, GSAP only for existing scoped canvas entrance motion, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-26-mobile-text-editing-design.md`

## Global Constraints

- Text editing has two phases: `TYPE → FORMAT`.
- Heading and body are creation presets only; both create the same normal text element.
- New text opens native editing immediately and selects placeholder content.
- Existing text uses single tap to select and double tap to edit.
- `Xong` and Back commit non-empty content, close editing, and keep text selected.
- Empty text is removed on edit exit.
- Vietnamese IME composition must not commit incomplete composition.
- Text width is bounded; wrapping grows height; corner resize preserves glyph proportions.
- Primary selected-text toolbar is `Font · Màu · Cỡ chữ · Căn chỉnh · •••`.
- Advanced text effects, rich-text spans, paragraph styles, AI effects, side-width handles, and gradient controls are out of this slice.
- Existing templates, legacy saved documents, autosave, undo/redo, lock, and desktop behavior must continue working.
- Do not add dependencies.

## Review Focus

- Vietnamese IME composition (`compositionstart` → input → `compositionend`) must commit the composed syllable exactly once. Test in Task 4.
- Legacy saved state with only top-level `state.text` must migrate to one visible text element without losing content/style. Test in Task 1.
- Empty placeholder/content exit must remove the element, not leave invisible state or an empty layer. Test in Task 1 and browser flow Task 6.
- Locked template text must not enter edit mode or transform and must show lock feedback. Test in Task 2 and browser flow Task 6.
- Keyboard viewport adjustment must not mutate document coordinates and must restore after edit. Test with browser geometry assertions in Task 4/6.

---

### Task 1: Text element domain model and reducer actions

**Files:**
- Modify: `src/lib/product-state.ts:46-107,434-465,467-656`
- Modify: `src/lib/storage.ts:8-19,69-115`
- Test: `src/test/product-state.test.ts`

**Interfaces:**
- Produces `TextElementData` and helpers consumed by canvas/shell:
  - `createTextElement(params: CreateTextElementParams): CanvasElement`
  - `getTextElement(state: DesignState, id: string): CanvasElement | null`
  - `getTextData(element: CanvasElement): TextElementData | null`
  - `getTextLayerName(element: CanvasElement): string`
  - `migrateLegacyText(state: DesignState): DesignState`
- Adds reducer actions:
  - `ADD_TEXT_ELEMENT`
  - `COMMIT_TEXT_EDIT`
  - `UPDATE_TEXT_STYLE`
  - existing element actions continue to handle move/resize/rotate/lock/delete/duplicate.

- [x] **Step 1: Write failing domain tests**

Add tests to `src/test/product-state.test.ts` covering:

```ts
test('creates heading and body as the same text element with different defaults', () => {
  const initial = createInitialState('card');
  const heading = transitionState(initial, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'heading',
    id: 'text-heading-1',
  });
  const body = transitionState(initial, {
    type: 'ADD_TEXT_ELEMENT',
    preset: 'body',
    id: 'text-body-1',
  });

  const headingElement = heading.elements?.[0];
  const bodyElement = body.elements?.[0];
  assert.equal(headingElement?.type, 'text');
  assert.equal(bodyElement?.type, 'text');
  assert.equal((headingElement?.data as TextElementData).text, 'Nhập tiêu đề');
  assert.equal((bodyElement?.data as TextElementData).text, 'Nhập nội dung');
  assert.notEqual((headingElement?.data as TextElementData).fontSize, (bodyElement?.data as TextElementData).fontSize);
});

test('commits text content while preserving element geometry and style', () => {
  const initial = stateWithTextElement();
  const next = transitionState(initial, {
    type: 'COMMIT_TEXT_EDIT',
    id: 'text-1',
    text: 'Chúc mừng sinh nhật mẹ',
  });
  const element = next.elements?.[0];
  assert.equal((element?.data as TextElementData).text, 'Chúc mừng sinh nhật mẹ');
  assert.equal(element?.width, 70);
  assert.equal(element?.x, 50);
});

test('removes text element when edit commits empty content', () => {
  const initial = stateWithTextElement();
  const next = transitionState(initial, { type: 'COMMIT_TEXT_EDIT', id: 'text-1', text: '   ' });
  assert.equal(next.elements?.some((element) => element.id === 'text-1'), false);
});

test('migrates legacy top-level text into one text element', () => {
  const legacy = { ...createInitialState('card'), text: 'Tên của bạn', color: '#315F86' };
  const migrated = migrateLegacyText(legacy);
  const element = migrated.elements?.find((candidate) => candidate.type === 'text');
  assert.equal((element?.data as TextElementData).text, 'Tên của bạn');
  assert.equal((element?.data as TextElementData).color, '#315F86');
});

test('text style update changes only selected text style', () => {
  const initial = stateWithTwoTextElements();
  const next = transitionState(initial, {
    type: 'UPDATE_TEXT_STYLE',
    id: 'text-2',
    patch: { fontSize: 28, align: 'right' },
  });
  assert.equal((next.elements?.[1].data as TextElementData).fontSize, 28);
  assert.equal((next.elements?.[1].data as TextElementData).align, 'right');
  assert.equal((next.elements?.[0].data as TextElementData).fontSize, 20);
});

test('text layer names use content and truncate long content', () => {
  const element = textElementWithContent('Một dòng chữ tiếng Việt rất dài để kiểm tra tên lớp');
  assert.equal(getTextLayerName(element), 'Một dòng chữ tiếng Việt rất dài…');
});
```

Define these concrete test helpers directly below the tests:

```ts
function textElementWithContent(text: string): CanvasElement {
  return createTextElement({ id: 'text-1', preset: 'body', text });
}

function stateWithTextElement(): DesignState {
  const state = createInitialState('card');
  const element = textElementWithContent('Nhập nội dung');
  return { ...state, text: 'Nhập nội dung', elements: [element] };
}

function stateWithTwoTextElements(): DesignState {
  const first = createTextElement({ id: 'text-1', preset: 'body', text: 'Một' });
  const second = createTextElement({ id: 'text-2', preset: 'body', text: 'Hai' });
  return { ...createInitialState('card'), text: 'Một', elements: [first, second] };
}
```

Use these helpers only to create meaningful domain fixtures; do not test implementation details such as object cloning alone.

- [x] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test --experimental-strip-types src/test/product-state.test.ts
```

Expected: FAIL because text payload/actions/helpers are not implemented.

- [x] **Step 3: Add typed text payload and factories**

In `src/lib/product-state.ts`, add:

```ts
export type TextPreset = 'heading' | 'body';
export type TextAlign = 'left' | 'center' | 'right';
export type TextWeight = 'regular' | 'medium' | 'bold';

export interface TextElementData {
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: TextWeight;
  fontStyle: 'normal' | 'italic';
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  placeholder?: boolean;
}

export interface CreateTextElementParams {
  id: string;
  preset: TextPreset;
  text?: string;
  canvasWidthPercent?: number;
  x?: number;
  y?: number;
  color?: string;
  fontFamily?: string;
}
```

Use one reliable Vietnamese-compatible default font, the existing `Be Vietnam Pro` family. Set heading/body defaults explicitly. Create the element at `x=50`, `y=50`, `width=70`, with a bounded width and initial height suitable for one or two lines. Derive layer labels through `getTextLayerName`; do not store a second heading/paragraph type.

- [x] **Step 4: Add reducer actions and compatibility synchronization**

Extend `DesignAction` with the actions listed in Interfaces. Implement:

- `ADD_TEXT_ELEMENT`: add a normal `type: 'text'` node with the preset payload and z-index.
- `COMMIT_TEXT_EDIT`: trim only for emptiness detection; preserve meaningful internal/newline whitespace; remove on empty; update payload text and `placeholder: false`.
- `UPDATE_TEXT_STYLE`: patch only text data for the addressed element.
- Existing top-level `state.text`, `state.color`, and compatible `productOptions` values synchronize when the addressed element is the primary/first text element so order summaries and old consumers remain intact.
- `DELETE_ELEMENT` and `REMOVE_CANVAS_ELEMENT` clear legacy top-level text only when deleting the primary text element.
- `DUPLICATE_ELEMENT` preserves text style/content, offsets the duplicate, assigns a new ID, and does not mark it placeholder.
- Lock actions continue to reject move/resize/rotate/edit against locked elements.

Implement `getDefaultElements` so legacy top-level text becomes a text element through the same factory, and implement `migrateLegacyText` as an idempotent hydration helper.

- [x] **Step 5: Update storage hydration boundary**

In `src/lib/storage.ts`, extend `RecentProject` with `elements?: CanvasElement[]`, persist `state.elements`, and leave missing `elements` valid for old JSON. `loadState` continues parsing stored data; `CustomizerShell` calls `migrateLegacyText` after load and recent-project resume. Do not write migration synchronously on every keystroke.

- [x] **Step 6: Run focused tests and verify pass**

Run:

```bash
node --test --experimental-strip-types src/test/product-state.test.ts
```

Expected: all existing tests plus new text tests pass.

---

### Task 2: Canvas text rendering, selection, and transform semantics

**Files:**
- Modify: `src/components/customizer/design-canvas.tsx:22-355`
- Modify: `src/components/customizer/selection-overlay.tsx`
- Modify: `src/lib/canvas-interaction.ts`
- Test: `src/test/canvas-interaction.test.ts` (create)

**Interfaces:**
- `DesignCanvas` consumes `textElements: CanvasElement[]`, `selectedTextId: string | null`, `onSelectText(id)`, and `onDoubleTapText(id)` while preserving image behavior.
- Produces text element selection and transform callbacks in existing shell-compatible form.

- [x] **Step 1: Write failing interaction tests**

Create `src/test/canvas-interaction.test.ts` with pure tests:

```ts
test('corner resize keeps text aspect ratio', () => {
  const result = computeAspectResize(
    { x: 50, y: 50, width: 140, height: 40 },
    'se',
    70,
    20,
    true,
    24,
  );
  assert.equal(Number((result.width / result.height).toFixed(2)), 3.5);
});

test('bounded text width never grows beyond configured maximum', () => {
  assert.equal(clampTextBoxWidth(92, 60, 75), 75);
  assert.equal(clampTextBoxWidth(64, 60, 75), 64);
});
```

- [x] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test --experimental-strip-types src/test/canvas-interaction.test.ts
```

Expected: FAIL because `clampTextBoxWidth` is not defined/exported.

- [x] **Step 3: Add text width constraint helper**

In `src/lib/canvas-interaction.ts`, add:

```ts
export function clampTextBoxWidth(value: number, min = 60, max = 75): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
```

Use percent-of-canvas coordinates consistently with existing element geometry. Keep side-width handles out of MVP.

- [x] **Step 4: Render all text elements from document state**

Refactor `DesignCanvas` so it accepts and renders text nodes from `state.elements`; `CustomizerShell` always passes migrated state, so no second canvas fallback path exists. Each text node must:

- use `data.text`, `data.color`, `data.fontFamily`, `data.fontSize`, `data.fontWeight`, `data.fontStyle`, `data.align`, `data.lineHeight`, and `data.letterSpacing`;
- wrap inside a bounded box using `max-width`/width semantics rather than an unbounded inline line;
- use `ResizeObserver` to report measured wrapped height through `onMeasureText(id, height)` only when the rounded height changed;
- receive one `data-element-id` attribute for browser smoke tests and layer targeting;
- render no invisible empty text.

Keep `isMockup` output unaffected by deriving one preview-only text element from the existing mockup props without mutating document state.

- [x] **Step 5: Preserve single/double tap and lock behavior**

Keep pointer gesture threshold and double-tap timing from `canvas-interaction.ts`. For text:

- single tap calls `onSelectText(id)` only;
- double tap calls `onDoubleTapText(id)` only when unlocked;
- locked text calls `onLockedFeedback` and never starts edit or transform;
- selected text renders `SelectionOverlay` with move, proportional corner resize, and rotate handle;
- transform commit identifies the text element ID, not only the generic `'text'` target.

Avoid putting an editable textarea inside the transformed text node; editing uses Task 4 overlay.

- [x] **Step 6: Run typecheck and interaction tests**

Run:

```bash
pnpm typecheck
node --test --experimental-strip-types src/test/canvas-interaction.test.ts
```

Expected: pass.

---

### Task 3: Selection model and editor reducer integration

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx:62-209,212-277,483-533,815-914`
- Modify: `src/lib/navigation.ts:11-116`
- Test: `src/test/navigation.test.ts` (modify/create)

**Interfaces:**
- `CustomizerShell` owns:

```ts
type TextEditState = {
  elementId: string;
  draft: string;
  isComposing: boolean;
  selectAll: boolean;
} | null;
```

- `EditorSheets` and `BottomNavigation` receive selected text element data through existing callback boundaries.
- Navigation resolver accepts `isTextEditing: boolean` and returns an edit-exit action before sheet/deselect/editor actions.

- [x] **Step 1: Write failing navigation tests**

Add:

```ts
test('back exits text editing before deselecting or leaving editor', () => {
  const action = resolveEditorBackAction({
    hasUnsavedWarning: false,
    isPreviewOpen: false,
    isPreflightOpen: false,
    activeSheet: null,
    focusMode: null,
    isTextEditing: true,
    selectedTarget: 'text',
    saveStatus: 'saved',
    returnView: 'setup',
  });
  assert.deepEqual(action, { type: 'EXIT_TEXT_EDIT', commitChanges: true });
});
```

Update existing resolver tests to assert the priority:

```text
unsaved/overlay/sheet → text edit → focus crop → deselect → viewport reset → leave editor
```

- [x] **Step 2: Run focused navigation tests and verify failure**

Run:

```bash
node --test --experimental-strip-types src/test/navigation.test.ts
```

Expected: FAIL until `isTextEditing` and `EXIT_TEXT_EDIT` exist.

- [x] **Step 3: Add shell selection state**

Add `selectedTextId` and `textEditState` to `CustomizerShell`. On hydration, run `migrateLegacyText` and select no object. On resume/template load, preserve text nodes and selected state only when explicitly entering edit.

Add these helpers; `TextEditState` includes `selectAll: boolean` so the overlay receives deterministic focus behavior:

```ts
const getSelectedTextElement = (current: DesignState, id: string | null): CanvasElement | null => {
  if (!id) return null;
  return (current.elements ?? []).find((element) => element.id === id && element.type === 'text') ?? null;
};

const beginTextEdit = (elementId: string, selectAll: boolean): void => {
  const element = getSelectedTextElement(state, elementId);
  const data = element ? getTextData(element) : null;
  if (!element || !data || element.locked) return;
  setSelectedTarget('text');
  setSelectedTextId(elementId);
  setActiveSheet(null);
  setTextEditState({ elementId, draft: data.text, isComposing: false, selectAll });
};

const commitTextEdit = (edit: Exclude<TextEditState, null>): void => {
  dispatch({ type: 'COMMIT_TEXT_EDIT', id: edit.elementId, text: edit.draft });
};

const exitTextEdit = (): void => {
  if (!textEditState || textEditState.isComposing) return;
  commitTextEdit(textEditState);
  setTextEditState(null);
};
```

`beginTextEdit` must refuse locked/missing nodes and set `activeSheet(null)`. `commitTextEdit` dispatches one `COMMIT_TEXT_EDIT`, clears edit state, keeps `selectedTarget='text'` and `selectedTextId=elementId` unless the text was empty, in which case it clears selection.

- [x] **Step 4: Update back hierarchy**

Extend `EditorBackState` with `isTextEditing`. Add `EXIT_TEXT_EDIT`. In `handleUnifiedBack`, commit current draft through `exitTextEdit` before clearing other focus state. Do not navigate to setup/launcher while text edit is active. Browser Back, Escape, and editor back button use the same resolver.

- [x] **Step 5: Wire canvas selection and transforms**

Pass migrated text elements, selected text ID, and callbacks to `DesignCanvas`. Single tap updates `selectedTarget='text'` and selected ID. Double tap calls `beginTextEdit(id, placeholder || templatePlaceholder)`. Transform commit updates the addressed element's transform with one history action. On deleting selected text, remove element and clear selection. On duplicate, select the duplicate but do not enter edit.

- [x] **Step 6: Run typecheck and navigation tests**

Run:

```bash
pnpm typecheck
node --test --experimental-strip-types src/test/navigation.test.ts
```

Expected: pass.

---

### Task 4: Focused mobile text editor with keyboard, IME, and viewport safety

**Files:**
- Create: `src/lib/text-edit-session.ts`
- Create: `src/components/customizer/text-edit-overlay.tsx`
- Modify: `src/components/customizer/customizer-shell.tsx:639-684,212-277`
- Modify: `src/app/globals.css`
- Test: `src/test/text-edit-session.test.ts` (create)

**Interfaces:**

```ts
interface TextEditOverlayProps {
  value: string;
  placeholder?: string;
  selectAllOnFocus: boolean;
  onChange: (value: string) => void;
  onCompositionChange: (isComposing: boolean) => void;
  onDone: () => void;
}
```

- [x] **Step 1: Write failing edit-session tests**

Create pure session tests for commit policy:

```ts
test('placeholder edit starts with select-all intent', () => {
  assert.equal(shouldSelectTextOnFocus({ placeholder: true, text: 'Nhập tiêu đề' }), true);
});

test('normal template content does not force select-all', () => {
  assert.equal(shouldSelectTextOnFocus({ placeholder: false, text: 'Chúc mừng' }), false);
});

test('composition keeps edit session active until composition ends', () => {
  const session = startTextEdit('text-1', 'Xin chào', false);
  const composing = updateComposition(session, true);
  assert.equal(composing.isComposing, true);
  assert.equal(canCommitTextEdit(composing), false);
  assert.equal(canCommitTextEdit(updateComposition(composing, false)), true);
});
```

Implement these pure helpers in `src/lib/text-edit-session.ts` with exact signatures: `shouldSelectTextOnFocus(input: { placeholder: boolean; text: string }): boolean`, `startTextEdit(elementId: string, draft: string, selectAll: boolean): ActiveTextEditState`, `updateComposition(session: ActiveTextEditState, isComposing: boolean): ActiveTextEditState`, and `canCommitTextEdit(session: ActiveTextEditState): boolean`. `ActiveTextEditState` is the non-null shape used by `CustomizerShell`. Keep DOM focus code in the overlay; tests cover only commit policy.

- [x] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test --experimental-strip-types src/test/text-edit-session.test.ts
```

Expected: FAIL before helpers and overlay behavior exist.

- [x] **Step 3: Implement native textarea overlay**

Create `TextEditOverlay` as a client component:

- fixed only within the editor shell stacking context, not a new route;
- `textarea` with `autoFocus`, native selection, clipboard, multiline wrapping, `inputMode="text"`, `enterKeyHint="done"` where supported;
- `onCompositionStart` / `onCompositionEnd` call `onCompositionChange`;
- `onChange` updates draft only;
- effect calls `.focus()` and `.select()` only when `selectAllOnFocus` is true;
- `Xong` calls `onDone`;
- no Font/Color/Size/Spacing toolbar while active;
- accessible label `Nội dung chữ` and minimum touch target for `Xong`.

Remove the existing `Hủy`, character counter, `maxLength={160}`, and full-screen editing copy. Long text remains editable and wraps; preflight can warn later without blocking input.

- [x] **Step 4: Add keyboard-safe viewport adjustment**

In `CustomizerShell`, record viewport and selected element geometry when edit starts. Use `visualViewport` resize/scroll listeners while editing. Adjust only the workspace viewport transform/pan so the active textarea/caret region remains above `visualViewport.height`; never mutate the text element's document `x`/`y`. On exit, restore the recorded viewport or `resetToFit()` when the old viewport is invalid.

Use CSS `env(safe-area-inset-bottom)` and `dvh` for the focused layer. Clean up listeners on exit/unmount. Do not add an animation loop; a short GSAP transform tween is allowed only for a state transition and must respect `prefers-reduced-motion`.

- [x] **Step 5: Wire commit semantics**

`Xong`, Back, and Escape use one exit path. Visibility loss flushes the current committed document state but does not end an active IME composition:

1. if composition is active, record a pending exit request and complete it from `compositionend`;
2. dispatch one `COMMIT_TEXT_EDIT` action;
3. remove empty object;
4. clear `textEditState`;
5. close keyboard through blur/focus removal;
6. keep selected non-empty object and reopen contextual toolbar.

Use existing debounced autosave; do not persist draft state per keystroke. On `visibilitychange`, commit only after composition has ended, then call `flushAutosave` with the resulting document state.

- [x] **Step 6: Run typecheck and focused tests**

Run:

```bash
pnpm typecheck
node --test --experimental-strip-types src/test/text-edit-session.test.ts
```

Expected: pass.

---

### Task 5: Add text presets and lightweight formatting toolbar/sheets

**Files:**
- Modify: `src/components/customizer/editor-sheets.tsx:23-60,119-159,266-485`
- Modify: `src/components/customizer/bottom-navigation.tsx:35-160`
- Modify: `src/components/customizer/customizer-shell.tsx:483-533,843-914`
- Test: `src/test/product-state.test.ts`

**Interfaces:**
- Add sheet actions:

```ts
onAddText: (preset: TextPreset) => void;
onSetTextStyle: (patch: Partial<TextElementData>) => void;
```

- Bottom toolbar text state exposes only `Font`, `Màu`, `Cỡ chữ`, `Căn chỉnh`, `•••`; content editing is double tap.

- [x] **Step 1: Write failing formatting tests**

Add reducer tests:

```ts
test('updates selected text alignment without changing content', () => {
  const state = stateWithTextElement();
  const next = transitionState(state, {
    type: 'UPDATE_TEXT_STYLE',
    id: 'text-1',
    patch: { align: 'center' },
  });
  assert.equal((next.elements?.[0].data as TextElementData).align, 'center');
  assert.equal((next.elements?.[0].data as TextElementData).text, 'Nhập nội dung');
});

test('duplicate preserves text style and offsets new element', () => {
  const next = transitionState(stateWithTextElement(), { type: 'DUPLICATE_ELEMENT', id: 'text-1' });
  assert.equal(next.elements?.length, 2);
  assert.deepEqual((next.elements?.[1].data as TextElementData).fontFamily, (next.elements?.[0].data as TextElementData).fontFamily);
  assert.notEqual(next.elements?.[1].x, next.elements?.[0].x);
});
```

- [x] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test --experimental-strip-types src/test/product-state.test.ts
```

Expected: FAIL until formatting and duplicate actions are complete.

- [x] **Step 3: Split Add → Chữ into heading/body presets**

In `EditorSheets`, replace the single `Thêm dòng chữ` action with two convenience choices:

```text
Thêm tiêu đề
Nhập tiêu đề

Thêm nội dung
Nhập nội dung
```

Both call `onAddText('heading' | 'body')`, close the drawer, and let the shell create/select/edit the same text element type. Use comfortable buttons, short copy, and no permanent heading/body layer type.

- [x] **Step 4: Simplify selected text toolbar**

In `BottomNavigation`, remove `Sửa chữ` from the primary text toolbar. Keep exactly the prioritized actions and labels. While `textEditState !== null`, render no bottom contextual toolbar. Preserve image toolbar/default toolbar behavior.

- [x] **Step 5: Connect formatting sheets to selected text ID**

Update shell callbacks so Font, Color, Size, and Alignment mutate `UPDATE_TEXT_STYLE` for `selectedTextId`, not only legacy top-level state. Keep current sheets lightweight:

- Font sheet selects existing font immediately.
- Color sheet updates text color immediately; preserve image opacity behavior separately.
- Font-size sheet range updates selected text live and groups the gesture as one semantic history action.
- Alignment sheet exposes `Trái`, `Giữa`, `Phải` only.
- More contains only supported actions: weight/style when font capability exists, line height, letter spacing, opacity, duplicate, lock, delete.

- [x] **Step 6: Run typecheck and tests**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: pass.

---

### Task 6: Browser smoke flow, visual pass, and final verification

**Files:**
- Modify: `src/components/customizer/customizer-shell.tsx` only for defects found by smoke flow.
- Modify: `src/components/customizer/design-canvas.tsx` only for defects found by smoke flow.
- Modify: `src/app/globals.css` only for focused editor/toolbar defects.
- Test: no permanent browser test required unless an existing browser suite is present.

- [x] **Step 1: Start a clean production-like server**

Run:

```bash
pnpm typecheck && pnpm test && pnpm build
pnpm start -p 3000
```

Use a clean browser context at mobile viewport `390×844` and desktop viewport `1280×800`.

- [x] **Step 2: Exercise the required mobile flow**

At mobile width:

1. Open editor with blank design.
2. Tap `Thêm`.
3. Tap `Chữ`.
4. Tap `Thêm tiêu đề`.
5. Assert one text element exists, placeholder is selected, keyboard/edit overlay is active, and bottom formatting toolbar is absent.
6. Type Vietnamese text containing diacritics, e.g. `Chúc mừng sinh nhật mẹ`.
7. Tap `Xong`.
8. Assert overlay/keyboard closes, text remains selected, selection handles remain, and toolbar shows `Font`, `Màu`, `Cỡ chữ`, `Căn chỉnh`, `•••`.
9. Open each primary formatting action and verify live canvas update without losing selection.
10. Double tap text, replace content, tap `Xong`, and assert the updated layer name uses content.
11. Delete all content, tap `Xong`, and assert the text element is gone.
12. Add body text and verify smaller/default body styling.
13. Test browser Back during text edit; assert it exits edit but stays in editor and leaves text selected.

- [x] **Step 3: Exercise template and lock flow**

Load a template with unlocked text, single tap it, double tap it, replace content, and assert normal behavior. Load a locked text element, tap/double tap/drag it, and assert lock feedback with no text edit or transform.

- [x] **Step 4: Exercise viewport and resize behavior**

Place/select text near the bottom of the canvas, enter edit, and assert active text stays above the virtual viewport/keyboard region. After `Xong`, assert document coordinates match their pre-edit values. Drag a corner handle and assert glyphs remain proportionally scaled; type enough content to force wrapping and assert height grows without horizontal infinite expansion.

- [x] **Step 5: Capture bounded visual review**

Capture one mobile and one desktop screenshot for:

- `TEXT_SELECTED` with contextual toolbar;
- `TEXT_EDITING` with focused content input and `Xong` only;
- font-size/color/alignment sheet;
- template locked feedback.

Inspect focus rings, touch targets, toolbar overflow, safe-area padding, Vietnamese diacritics, and reduced-motion behavior. Fix defects in one batch, then capture one confirmation pass.

- [x] **Step 6: Run final verification**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
/Users/minhmice/Documents/Projects/quynhtrang/.claude/skills/impeccable/scripts/impeccable detect --json \
  src/components/customizer/customizer-shell.tsx \
  src/components/customizer/text-edit-overlay.tsx \
  src/components/customizer/design-canvas.tsx \
  src/components/customizer/bottom-navigation.tsx \
  src/components/customizer/editor-sheets.tsx \
  src/app/globals.css
```

Expected: typecheck, all tests, and production build pass. Detector findings must be resolved or explicitly intentional in the changed surface.

- [x] **Step 7: Remove temporary scaffolding**

Delete throwaway screenshots/scripts outside the project’s intended review artifacts. Keep only production code, permanent tests, and the approved spec/plan.
