# Mobile Text Editing UX Design

## Goal

Make mobile text editing in the print customizer feel like two deliberate phases:

```text
TYPE → FORMAT
```

A first-time Vietnamese customer can add text, type immediately, finish editing, then format the selected text without entering a desktop-style typography workflow.

## Scope

This design changes the editor's text model and interaction contract across wrapping paper, cards, stickers, notebooks, and templates. It keeps one generic text element model; heading/body are creation presets only. It does not add advanced text effects, rich-text spans, paragraph styles, AI writing, or product-specific editors.

## Existing constraints

- Next.js App Router with React 19 and TypeScript.
- Editor state currently lives in `CustomizerShell` and `DesignState`.
- `DesignState` supports `CanvasElement[]`, but the visible canvas still renders one legacy top-level `state.text` value.
- `DesignCanvas` already owns single-tap/double-tap detection and proportional transform gestures.
- `EditorSheets` already owns font, color, font-size, and secondary property drawers.
- `BottomNavigation` already swaps the default toolbar for a contextual toolbar.
- Autosave is debounced and flushes on document visibility changes.
- Vietnamese is the product language.

## State model

Use the existing `CanvasElement` as the document source of truth for text objects. Keep top-level `DesignState.text`, `color`, and compatible typography options only as a migration/read compatibility layer for existing saved designs and order summaries; new mutations must update the selected text element and synchronize the legacy fields when the selected element is the primary text object.

Add a typed text payload instead of an unstructured `Record<string, unknown>`:

```ts
export interface TextElementData {
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 'regular' | 'medium' | 'bold';
  fontStyle: 'normal' | 'italic';
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  placeholder?: boolean;
}
```

Text elements retain normal `CanvasElement` behavior: `id`, `x`, `y`, `width`, `height`, `rotation`, `locked`, and `zIndex`. `width` is a bounded text-box width. `height` is derived from wrapped content for normal editing and may update during render/layout measurement; corner transforms scale the whole text object proportionally.

Transient editor state:

```ts
type TextEditState = {
  elementId: string;
  draft: string;
  isComposing: boolean;
} | null;
```

The selected target remains the existing `'text' | 'image' | null` contract, with a separate selected text element ID when more than one text element exists.

## State transitions

```text
ADD_TEXT_PRESET
  → create normal text CanvasElement
  → select element
  → TEXT_EDITING
  → native textarea receives focus and selects placeholder

TEXT_SELECTED
  → single tap
  → bounding box, resize handles, rotate handle, text toolbar

TEXT_SELECTED
  → double tap
  → TEXT_EDITING
  → native mobile keyboard

TEXT_EDITING
  → Xong / Back / blur policy
  → commit draft as one semantic content action
  → empty draft removes element
  → TEXT_SELECTED
```

New heading defaults:

- text: `Nhập tiêu đề`
- font size: larger existing supported size
- weight: `medium` or `bold` only when supported by the selected font
- centered alignment
- placeholder metadata: `true`
- width: 60–75% of active canvas width
- position: visible canvas center, not underneath bottom toolbar

New body defaults:

- text: `Nhập nội dung`
- smaller supported size
- regular weight
- left or product-appropriate centered alignment
- placeholder metadata: `true`
- same bounded width and visible-center placement rules

The first edit of a placeholder selects all placeholder content. Templates may mark designated copy with `placeholder: true`; otherwise double tap starts with the caret and normal platform behavior.

## Text editing surface

Do not use a full-screen route for text editing. Render a focused editor layer or textarea overlay inside the editor shell. It must:

- use native textarea behavior for caret, select range, copy, paste, select all, and Vietnamese IME;
- call `focus()` and select placeholder content after mount;
- handle `compositionstart` / `compositionend` without committing incomplete Vietnamese composition;
- keep `Xong` as the only primary editing action;
- hide the normal bottom toolbar while editing;
- keep the edited object visible above the keyboard using temporary viewport adjustment only;
- restore the prior/sensible viewport on exit without changing document coordinates;
- commit on `Xong` and the transient Back action;
- delete an empty text object on exit;
- leave the non-empty object selected after exit.

The existing `Hủy` action is removed for normal typing. Undo provides cancellation semantics.

## Canvas behavior

`DesignCanvas` renders all text elements from the document model. For each unlocked text element:

- single tap selects only that element;
- double tap enters text editing for that element;
- moving uses the existing transform gesture;
- corner handles preserve aspect ratio and never distort glyphs;
- text wraps within `width`;
- measured height grows with wrapped content;
- no horizontal infinite growth;
 - side-width handles are out of MVP; corner handles scale the complete text object proportionally. Width remains bounded and wrapping/height are measured from content.

Locked text does not enter edit mode, move, resize, or rotate. It stays selectable only when existing product behavior needs lock feedback; it shows lightweight lock feedback and no text editing toolbar.

Template text uses exactly the same interaction model as user-created text. No replacement-text mode is introduced.

## Formatting

When a text element is selected and not being edited, the contextual toolbar prioritizes:

```text
Font · Màu · Cỡ chữ · Căn chỉnh · •••
```

No `Sửa chữ` action is required as the primary action; content editing is double tap. `•••` contains only supported secondary properties, such as font weight/style, line height, letter spacing, opacity, duplicate, lock, and delete. Unsupported effects are not shown.

- Font uses the existing shared Font Browser Sheet contract and updates immediately.
 - Color uses the existing color sheet. Gradient is out of this text UX slice; preserve any existing gradient-capable color contract without adding gradient controls here.
- Font size uses the existing lightweight slider sheet and live previews. Gesture changes become one history entry at gesture end.
- Alignment exposes only `Trái`, `Giữa`, and `Phải`.
 - Weight/style options are out of the primary toolbar. Add them to More only when the font catalog exposes explicit capabilities; the current default font remains the reliable Vietnamese-compatible fallback. Unsupported variants are never synthesized.
- Format changes remain semantic history actions.
- Layer names use actual text content, truncated for display; never generic `Text` for a normal text element.

## Data compatibility and autosave

On hydration, migrate legacy saved `state.text` into one text element when no text elements exist. When templates or old documents contain a top-level text value, preserve it and expose it through the same selected-text workflow. New element additions must not create a permanent heading/paragraph type.

Text input updates local draft state during typing. Document state updates on edit exit or a debounced content commit, not synchronously into expensive storage on every keystroke. Existing debounced autosave and visibility flush remain the persistence boundary.

History rules:

- one content-edit action per edit session;
- one font/color/alignment action per committed property change;
- one font-size action per completed slider gesture;
- transform gesture commits remain one action;
- empty text removal is one action and undo restores the object.

## Acceptance criteria

1. `Thêm → Chữ → Thêm tiêu đề` creates one normal text element with `Nhập tiêu đề`, selects it, opens keyboard, and selects placeholder content.
2. `Thêm → Chữ → Thêm nội dung` behaves identically with `Nhập nội dung` and body defaults.
3. Typing immediately replaces the selected placeholder.
4. New text starts centered in a bounded 60–75% canvas-width box and remains visible above the keyboard.
5. Single tap on existing text selects without opening keyboard.
6. Double tap on existing unlocked text enters native text editing.
7. `Xong` commits content, closes keyboard, and leaves the text selected with the formatting toolbar visible.
8. Back during text editing commits valid current text, closes edit mode, keeps the text selected, and never leaves the editor.
9. Empty text is removed on edit exit; no invisible empty element remains.
10. Vietnamese IME composition is not prematurely committed.
11. Text toolbar exposes Font, Màu, Cỡ chữ, Căn chỉnh, and More with touch-sized controls; formatting is not shown while typing.
12. Font, color, size, and alignment update the selected text immediately and preserve selection.
13. Text wraps within bounded width, grows in height, and corner resize preserves glyph proportions.
14. Locked template text cannot be edited or transformed and gives lock feedback.
15. Template text, duplicated text, and user-created text share the same model and interaction behavior.
16. Layer names reflect text content and truncate long text.
17. Undo/redo remains useful: typing is grouped, formatting is semantic, and empty deletion is reversible.
18. Existing saved legacy designs load without losing text.
19. Mobile and desktop use the same document behavior; desktop may use the same focused editor overlay with wider layout.

## Verification

- Pure Node tests for text element creation, migration, placeholder/empty cleanup, lock rules, formatting updates, and history-facing reducer transitions.
- Browser smoke flow at mobile width: add heading, type Vietnamese text, finish, format font/color/size/alignment, double tap edit again, delete content and finish.
- Browser smoke flow for template text and locked text.
- Browser viewport/keyboard test verifies active text remains visible and document coordinates remain unchanged.
- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Impeccable detector on changed UI files.
- One bounded visual review pass on mobile and desktop, including reduced-motion behavior if motion is added.
