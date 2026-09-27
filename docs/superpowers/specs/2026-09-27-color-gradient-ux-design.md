# Color & Gradient UX Design

## Goal

Build one reusable mobile Color property sheet for solid colors and simple gradients. It must feel fast for non-designers, update the selected artwork immediately, preserve canvas selection, and create one semantic undo action per editing session.

## Product scope

Supported color targets:

- Text → Fill
- Shape → Fill
- Shape → Border
- Sticker → Border
- Wrapping Paper → Background

The color system owns the shared domain and interaction model. It does not create fake sticker assets. Sticker targets are supported when a real sticker element exists; existing canvas rendering gaps remain separate from the color domain.

Out of scope:

- three or more gradient stops;
- editable gradient stop positions;
- RGB, HSL, CMYK, print profiles;
- opacity inside Color;
- eyedropper workflow;
- Brand Kit;
- AI palette generation;
- global palette replacement;
- photo color extraction;
- professional color management.

## Architecture

The subsystem uses four boundaries:

1. **Semantic color domain** — canonical `ColorValue` data, validation, palette values, recent-color merging, and design-color extraction.
2. **Strongly typed target resolver** — reads/writes a color value for a text, shape, sticker, or surface target without putting element-specific branches in the sheet.
3. **Transient edit session** — updates the single document being rendered during interaction, but records one initial document snapshot and commits one undo transaction when the sheet closes.
4. **Renderer adapters** — convert semantic colors to CSS or other render formats. CSS gradient strings are never stored as canonical document data.

The existing document state remains the only visual source of truth. There is no CSS-only preview state that can diverge from the document.

Recommended module boundaries:

- `src/lib/color/color-types.ts` — `HexColor`, `SolidColor`, `LinearGradientColor`, `RadialGradientColor`, `ColorValue`, `GradientDirection`, target types.
- `src/lib/color/color-target.ts` — target capability checks plus pure `getColorValue` / `setColorValue` resolution.
- `src/lib/color/color-validation.ts` — `normalizeHexColor`, valid-HEX checks, and safe fallback behavior.
- `src/lib/color/color-renderers.ts` — CSS/swatch render adapters.
- `src/lib/color/color-recents.ts` — project metadata and device localStorage helpers.
- `src/components/customizer/color-picker-sheet.tsx` — shared Solid/Gradient UI only.
- `src/components/customizer/use-color-editor.ts` — target-bound edit-session controller.

If the existing project conventions make fewer files safer, `color-types.ts` and `color-validation.ts` may share one file, but domain and UI responsibilities must remain separate.

## Canonical data model

Colors use normalized six-digit uppercase HEX values.

```ts
type HexColor = `#${string}`;

type SolidColor = {
  kind: 'solid';
  color: HexColor;
};

type LinearGradientColor = {
  kind: 'gradient';
  gradientType: 'linear';
  colors: [HexColor, HexColor];
  direction: 'right' | 'bottom-right' | 'bottom' | 'bottom-left';
};

type RadialGradientColor = {
  kind: 'gradient';
  gradientType: 'radial';
  colors: [HexColor, HexColor];
  center: 'center';
};

type ColorValue = SolidColor | LinearGradientColor | RadialGradientColor;
```

`HexColor` is a branded/type-level contract; runtime validation must still enforce `#RRGGBB`.

Rules:

- `#fff`, `fff`, and `#FFFFFF` normalize to `#FFFFFF`.
- Invalid HEX never replaces the current valid color.
- Solid → Gradient creates a linear gradient with `colors: [currentColor, '#FFFFFF']` and `direction: 'right'`.
- Gradient → Solid uses `colors[0]`.
- Radial gradients use a fixed center in MVP and do not expose a direction control.
- Color values must always contain exactly two gradient colors.
- Opacity remains in the existing separate opacity control.

## Strongly typed targets

```ts
type ColorTarget =
  | { kind: 'element'; elementId: string; property: 'fill' }
  | { kind: 'shape'; elementId: string; property: 'fill' | 'stroke' }
  | { kind: 'sticker'; elementId: string; property: 'border' }
  | { kind: 'surface'; surfaceId: string; property: 'background' };
```

Required pure operations:

```ts
getColorValue(state: DesignState, target: ColorTarget): ColorValue | null;
setColorValue(state: DesignState, target: ColorTarget, value: ColorValue): DesignState;
supportsGradient(target: ColorTarget): boolean;
extractDesignColors(state: DesignState): HexColor[];
```

The resolver owns element/property mapping. `ColorPickerSheet` must not inspect selected element types. Unsupported or missing targets return `null` / unchanged state rather than throwing.

Document migration must preserve existing legacy string colors while moving canonical color data into the shared model:

- Add canonical `ColorValue` fields at the document/element properties that own color; legacy string fields remain read-compatible only during migration and are removed from active callers after cutover.
- `DesignState.color` is migrated to the active surface/background `ColorValue` (or the equivalent canonical surface field); callers must stop treating it as a CSS string.
- `TextElementData.color` is migrated to a canonical fill `ColorValue`.
- Shape `data.fill` and `data.stroke` strings migrate to `ColorValue`.
- Sticker `data.border` strings migrate to `ColorValue` when sticker elements exist.
- Existing background strings migrate to the active surface background `ColorValue`. For current MVP documents, the surface target uses the active product surface identifier (for example `front` or `inside`) and does not invent a second surface model.
- Unknown/malformed persisted colors use the existing valid value or the documented default, never black because a browser color input defaulted an invalid value.

## Persistence and recents

Recent colors are not design content and must not be part of undo snapshots.

- `ProjectEditorMetadata.recentColors` persists with the project but outside `DesignState`, `past`, and `future`.
- Device recent colors persist in localStorage as a small normalized HEX list.
- Each list deduplicates by normalized HEX and keeps at most 8 values.
- The visible `Gần đây` list merges project recent first, then device recent, then deduplicates and caps at 8.
- A selected solid color updates both recent lists when the edit session closes successfully. Gradient stops may be added as recent solid colors when selected or committed.
- `Design Colors` is derived from the current document on every relevant render/update. It collects solid colors and both stops from text, shapes, stickers, and surface backgrounds, then deduplicates normalized HEX values.
- No separate design-color cache is required in MVP.

## Color Sheet UX

The sheet opens from `Màu` as a compact bottom property sheet and keeps the selected object visible on canvas.

First-level tabs:

```text
Màu đơn | Gradient
```

Default tab:

- Solid when target value is solid.
- Gradient when target value is already a gradient.

Solid tab order:

1. `Màu trong thiết kế` — prominent swatches extracted from the document.
2. `Gần đây` — merged project/device recent colors; hidden when empty.
3. `Bảng màu cơ bản` — small curated palette.
4. `+ Màu tùy chỉnh` — expands native picker and HEX input.

The UI shows swatches and friendly labels only. It does not expose technical color metadata by default.

Custom controls:

- native `<input type="color">` opened by a visible swatch/button;
- HEX text input showing normalized current value;
- invalid HEX keeps the last valid value and shows a short inline Vietnamese error;
- native picker presentation is not assumed to have a fixed layout or hue-slider location;
- no Apply button.

Gradient tab:

```text
[ Linear ] [ Radial ]

Màu 1  ●
Màu 2  ●

Hướng
[ → ] [ ↘ ] [ ↓ ] [ ↙ ]
```

- Exactly two colors.
- Tapping `Màu 1` or `Màu 2` opens the same color selection flow used by Solid.
- Linear shows direction presets; no angle field.
- Radial hides direction presets and uses fixed center.
- Switching tabs updates the document immediately.
- The sheet closes only through normal sheet close/back gestures or explicit close behavior; selecting a swatch does not force-close the sheet.

The sheet remains Vietnamese, touch targets are approximately 44px, selected swatches have a non-color indicator such as checkmark/outline, and all icon-only controls have accessible labels.

## Edit session and history

Opening Color creates a `ColorEditSession` bound to the current target:

```ts
type ColorEditSession = {
  target: ColorTarget;
  initialState: DesignState;
  initialValue: ColorValue;
};
```

While open:

- every valid swatch, HEX, gradient-type, gradient-color, or direction change updates the current document immediately;
- the canvas renders from that current document;
- repeated picker input does not append to `past`;
- selection remains unchanged;
- autosave may serialize the current document safely because it is the same document being rendered.

On close:

- if the target value equals the initial value, no history entry is added;
- if it changed, append exactly `initialState` to `past` and clear `future`;
- add relevant solid colors to project/device recent lists;
- clear the session.

On cancellation only if the existing close semantics explicitly require cancellation, restore `initialState` without creating history. Normal Color close keeps the latest value, matching the product requirement.

Undo after a changed session returns to the value captured on open in one step. Changing target or leaving the editor must close/settle the session before a new target is opened.

## Target behavior

- Text fill reads/writes selected text element fill.
- Shape fill and border read/write `data.fill` / `data.stroke` through the resolver.
- Sticker border reads/writes `data.border` through the resolver when a sticker element exists.
- Wrapping Paper Background reads/writes the active surface background.
- The selected object remains selected after the sheet closes.
- The sheet must not directly edit canvas geometry or selection.
- If target is locked, controls are disabled or no-op with the existing lock feedback; no history entry is created.
- If a target does not support gradient, the Gradient tab is hidden or disabled based on `supportsGradient`.

## Rendering

Canonical `ColorValue` is converted at render boundaries:

- solid → `backgroundColor` / `color` / stroke color;
- linear → CSS `linear-gradient(...)` or the canvas renderer's equivalent;
- radial → CSS `radial-gradient(circle at center, ...)` or the renderer equivalent.

The renderer owns direction-to-angle mapping for the four visual presets. The document never stores CSS strings or numeric angles as the primary model.

Existing shape rendering must be extended only enough to display its fill and border values. Do not add a sticker asset library as part of this feature. Future Konva/export adapters can consume the same `ColorValue` without changing document data.

## Error and edge behavior

- Invalid HEX: retain last valid value, show inline error, do not mutate the document.
- Invalid persisted value: migrate to current valid value/default without throwing.
- Missing element/surface target: resolver returns unchanged state; sheet closes safely if target disappears.
- Locked element: no-op and preserve selection.
- Gradient with missing/invalid stop: repair through deterministic migration to current color plus `#FFFFFF`; never render malformed CSS.
- Empty design colors/recent colors: hide that section, keep palette visible.
- Browser/native color input differences: UI remains usable through explicit swatch, valid HEX field, and palette controls.
- Contrast: do not auto-adjust artwork colors. Any future warning is separate from this MVP.

## Accessibility and responsive behavior

- Vietnamese labels and concise copy.
- `aria-selected` on tabs/swatches, visible focus states, and descriptive labels for swatches where needed.
- Selection indication cannot rely only on color.
- Minimum practical touch target around 44px.
- Bottom sheet respects safe-area padding and keyboard viewport behavior.
- Canvas remains visible behind/above the compact sheet for live comparison.
- Desktop reuses the same sheet content and target model in a wider adaptation; no second color workflow.

## Verification contract

Permanent unit tests must cover:

1. HEX normalization and invalid-input preservation.
2. Solid/linear/radial value shapes and deterministic solid↔gradient conversion.
3. Four linear direction mappings and fixed radial center rendering.
4. Target resolver reads/writes text, shape fill, shape border, sticker border, and surface background.
5. Unsupported/missing/locked targets remain unchanged.
6. Design-color extraction includes gradient stops and deduplicates values.
7. Project/device recent merging, deduplication, and maximum length.
8. Legacy string-color migration without losing valid colors.
9. Color edit session batches many live updates into one undo snapshot and adds none for no-op close.

Browser smoke coverage:

- Mobile: open `Màu`, select design/recent/palette colors, type valid and invalid HEX, change several colors, close, verify canvas/selection, reopen, verify recent colors, undo once.
- Mobile: switch Solid → Linear, edit both stops, change direction, switch Radial, close, reopen, verify persisted semantic gradient and one-step undo.
- Desktop: same target and gradient flow at wide viewport; verify no second workflow or clipped controls.
- Locked target: verify no visual/document mutation and no history entry.

After UI implementation, run the Impeccable mechanical detector once over changed UI files, then run typecheck, unit tests, production build, and bounded browser smoke checks.

## Future extension points

The model intentionally leaves room for:

- extracted photo colors as another `Design Colors` provider;
- additional gradient stops;
- gradient stop positions;
- eyedropper input;
- Konva/export render adapters;
- brand palette sources.

None of these are part of MVP behavior.
