# Undo / Redo UX & History Semantics Specification (State 23)

**Target:** Mobile & Desktop Print Customizer Editor  
**Status:** Approved  
**Author:** Assistant & Engineering Team  
**Date:** 2026-09-28  

---

## 1. Executive Summary & Guiding Principle

**"Undo the user's intent, not low-level implementation events."**

For non-designers customizing sentimental print products on mobile devices, Undo and Redo must feel instant, predictable, and invisible until needed.
The editor records high-level design decisions (moving an object, editing text, changing a font, cropping a photo, creating a group). It strictly excludes low-level mouse movements, continuous slider scrubbing, font/color browsing previews, viewport adjustments, and selection clicks from history.

---

## 2. Core Architecture & Data Model

### 2.1 History Controller & Bounded Stack (`src/lib/history.ts`)

History is maintained as a bounded, immutable snapshot stack in editor memory:

```typescript
export type HistoryActionType =
  | 'add'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'edit-text'
  | 'change-font'
  | 'change-font-size'
  | 'change-text-align'
  | 'change-color'
  | 'change-gradient'
  | 'change-opacity'
  | 'crop'
  | 'remove-background'
  | 'refine-background'
  | 'replace-image'
  | 'change-mask'
  | 'group'
  | 'ungroup'
  | 'delete'
  | 'duplicate'
  | 'reorder-layer'
  | 'lock'
  | 'unlock'
  | 'apply-template'
  | 'change-product-option';

export interface SelectionSnapshot {
  selectedTarget: 'image' | 'text' | 'shape' | 'sticker' | 'group' | null;
  selectedElementId: string | null;
  selectedElementIds: string[];
  selectionMode: 'default' | 'multi-select' | 'group-edit';
  activeGroupId: string | null;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  type: HistoryActionType;
  label: string; // User-facing Vietnamese label: "Đổi màu", "Nhóm", "Xóa ảnh"
  before: DesignState;
  after: DesignState;
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
  affectedIds: string[];
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  limit: number; // Default 75
}

export interface HistoryTransaction {
  id: string;
  type: HistoryActionType;
  label: string;
  baselineState: DesignState;
  baselineSelection: SelectionSnapshot;
  affectedIds: string[];
  startTime: number;
}
```

### 2.2 Memory & Asset Lifecycle Contract

1. **No Binary Duplication:** History entries reference asset identifiers and URLs (`assetId`, `src`, `originalSrc`, `removedBackgroundSrc`). Raw image blob bytes and base64 strings are never cloned across history snapshots.
2. **Asset Retention During Session:** When an image is replaced or background removed, `revokeImageUrl()` is deferred until history containing references to that asset is cleared or the session terminates.
3. **Session-Scoped History:**
   - History exists solely in memory during the active editing session.
   - Autosave serializes the latest valid `DesignState` to local storage (debounced 400ms).
   - Upon page reload, the latest autosaved `DesignState` is restored, while the Undo/Redo stack initializes empty (`past: []`, `future: []`).

---

## 3. Transaction Model for Continuous & Focused Workflows

Interactive editing follows a strict **Transaction Lifecycle**:

```text
[User Begins Interaction]
       │
       ▼
beginTransaction(type, label, affectedIds)
  ├─ Captures baselineState & baselineSelection
  └─ Sets activeTransaction (pauses background autosave)
       │
       ▼
[Live Previews & Visual Updates]
  ├─ Direct canvas & UI updates without polluting history
  └─ Real-time rendering with 0 history entries created
       │
   ┌───┴────────────────────────┐
   ▼                            ▼
commitTransaction()         cancelTransaction()
  ├─ Compare current vs base   ├─ Restore baselineState exactly
  ├─ If changed: commit ONE    ├─ Restore baselineSelection
  │  HistoryEntry to past      └─ Commit ZERO history entries
  │  and clear future
  └─ If unchanged: commit 0
```

### 3.1 Standard Tool Transactions

| Tool / Mode | Trigger `beginTransaction` | In-flight Behavior | Trigger `commitTransaction` | Trigger `cancelTransaction` |
|---|---|---|---|---|
| **Font Browser** | User taps Font button / opens sheet | Tap font items updates canvas font preview live | Close sheet via `×`, backdrop, or swipe-down | Escape key or Back action before selection confirmed |
| **Color Sheet** | User taps Màu button / opens sheet | Color swatches & hex picker update canvas live | Close sheet | Sheet cancel |
| **Font Size Slider** | Slider `onPointerDown` | Slider `onChange` scrubs size live on canvas | Slider `onPointerUp` / `onChangeEnd` | Pointer cancel |
| **Opacity Slider** | Slider `onPointerDown` | Slider `onChange` scrubs opacity live | Slider `onPointerUp` / `onChangeEnd` | Pointer cancel |
| **Crop Focus Mode** | User enters Crop mode | Pan & pinch gestures adjust internal crop coordinates | Tap `Xong` (Done) | Tap `Hủy` (Cancel) |
| **Background Refine** | User enters Refine mode | Local brush strokes with internal local undo | Tap `Xong` (Done) | Tap `Hủy` (Cancel) |
| **Text Edit Overlay** | User double-taps text or taps Sửa chữ | Native typing / IME composition in overlay | Tap `Xong` (Done) | Cancel / discard empty text |
| **Mask Picker** | User taps Mask item in sheet | Quick visual outline preview | Sheet close / confirm | Sheet dismiss |
| **Multi-select Gestures** | Pointer down on combined bounding box | Move/resize/rotate live coordinates | Pointer up (exceeded 6px threshold) | Pointer cancel (< 6px considered tap) |

---

## 4. UI Controls, Top Bar & Keyboard Accessibility

### 4.1 Fixed Top Bar Layout

The Editor Top Bar maintains a permanent, rigid structure:

```text
┌─────────────────────────────────────────────────────────────┐
│ [←]   Tên thiết kế · Đã lưu              [↶ Undo] [↷ Redo]  │
└─────────────────────────────────────────────────────────────┘
```

1. **Stable Geometry:**
   - Undo and Redo icons remain permanently in the top bar.
   - When unavailable, buttons render in an accessible disabled state:
     - `disabled={!canUndo}`
     - `aria-disabled={!canUndo}`
     - Visual style: `opacity-30 cursor-not-allowed`
     - Retains full `44×44px` minimum hit area to prevent layout shifting.
2. **Instant Rapid Response:**
   - Tapping Undo/Redo rapidly executes synchronously without waiting for animations.
   - Canvas updates instantly.
3. **Transaction Conflict Resolution:**
   - If user taps global Undo while a property sheet or focus mode has an uncommitted transaction:
     - **Rule:** The active transaction is canceled/reverted first, restoring the pre-session state.
     - Global history underneath is not skipped or corrupted.
4. **Desktop Keyboard Shortcuts:**
   - `Cmd+Z` (macOS) / `Ctrl+Z` (Windows/Linux) &rarr; Undo.
   - `Cmd+Shift+Z` or `Cmd+Y` / `Ctrl+Shift+Z` or `Ctrl+Y` &rarr; Redo.
   - Shortcuts are disabled when the user is actively typing in a native `<input>`, `<textarea>`, or content-editable surface to avoid interfering with native text editing.

---

## 5. Selection Restoration & Visual Feedback

### 5.1 Selection Restoration Rules

When Undo or Redo is applied:
1. If the affected element exists in the restored state, restore its selection (`selectedElementId`, `selectedTarget`).
2. If multiple elements were affected (e.g. Group, Ungroup, Multi-delete), restore `selectionMode = 'multi-select'` and `selectedElementIds`.
3. If an element was deleted and then restored via Undo, it becomes re-selected immediately so the user can verify what returned.

### 5.2 Lightweight Feedback (Toast Policy)

- **Do NOT show toasts for:** Move, Resize, Rotate, basic single-color changes, slider scrub. The visual canvas change is immediate and sufficient.
- **Show concise toast on Undo/Redo for structural/off-canvas actions:**
  - `Đã hoàn tác: Xóa ảnh`
  - `Đã hoàn tác: Nhóm`
  - `Đã hoàn tác: Thay ảnh`
  - `Đã hoàn tác: Đổi font`
  - `Đã làm lại: Xóa ảnh`
  - `Đã làm lại: Nhóm`

---

## 6. Action Taxonomy & Vietnamese Labels

| Action Type | Internal ID | User-facing Label | Toast on Undo |
|---|---|---|---|
| Add Element | `add` | `Thêm [đối tượng]` | `Đã hoàn tác: Thêm đối tượng` |
| Move Object(s) | `move` | `Di chuyển` | None |
| Resize Object(s) | `resize` | `Phóng to/Thu nhỏ` | None |
| Rotate Object(s) | `rotate` | `Xoay` | None |
| Edit Text Content | `edit-text` | `Sửa chữ` | `Đã hoàn tác: Sửa chữ` |
| Change Font Family | `change-font` | `Đổi font` | `Đã hoàn tác: Đổi font` |
| Change Font Size | `change-font-size` | `Đổi cỡ chữ` | None |
| Change Text Alignment| `change-text-align`| `Căn lề chữ` | None |
| Change Color | `change-color` | `Đổi màu` | None |
| Change Opacity | `change-opacity` | `Đổi độ mờ` | None |
| Crop Image | `crop` | `Cắt ảnh` | `Đã hoàn tác: Cắt ảnh` |
| Remove Background | `remove-background` | `Xóa nền` | `Đã hoàn tác: Xóa nền` |
| Refine Background | `refine-background` | `Chỉnh vùng cắt` | `Đã hoàn tác: Chỉnh vùng cắt` |
| Replace Image | `replace-image` | `Thay ảnh` | `Đã hoàn tác: Thay ảnh` |
| Change Mask | `change-mask` | `Đổi khung hình` | `Đã hoàn tác: Đổi khung hình` |
| Group Elements | `group` | `Nhóm đối tượng` | `Đã hoàn tác: Nhóm` |
| Ungroup Elements | `ungroup` | `Bỏ nhóm` | `Đã hoàn tác: Bỏ nhóm` |
| Delete Element(s) | `delete` | `Xóa` | `Đã hoàn tác: Xóa` |
| Duplicate Element(s)| `duplicate` | `Nhân bản` | `Đã hoàn tác: Nhân bản` |
| Reorder Layer | `reorder-layer` | `Đổi thứ tự lớp` | `Đã hoàn tác: Đổi thứ tự lớp` |
| Lock / Unlock | `lock` / `unlock` | `Khóa / Mở khóa` | None |
| Apply Template | `apply-template` | `Áp dụng mẫu` | `Đã hoàn tác: Áp dụng mẫu` |

---

## 7. Explicit Non-Goals & MVP Boundaries

1. **No Hidden Multi-Finger Gestures:** Two-finger tap / three-finger swipe for undo/redo are excluded. Fixed top-bar buttons are the primary mobile interaction.
2. **No Branching / Customer Version History:** Linear undo/redo stack only. When user performs a new mutation after undoing, the `future` stack is cleared.
3. **No History for Viewport & Transient UI State:** Canvas zoom, pan, sheet detent, search queries, layers sheet open/close, and selection toggles never enter history.
4. **No Full Binary Cloning:** Never clone raw file buffers into history.
