# Multi-select & Group UX Design Specification (State 22)

**Target:** Mobile & Desktop Print Customizer Editor  
**Status:** Approved  
**Author:** Assistant & Engineering Team  
**Date:** 2026-09-27  

---

## 1. Executive Summary & Core Principle

**"Select together temporarily. Group together only when the user explicitly asks."**

The customizer editor clearly separates two distinct concepts:
- **Multi-selection (`MULTI_SELECT`):** A temporary UI state in the editor for executing one-off batch actions (move, resize, rotate, duplicate, delete) on multiple objects. It is **never** serialized into the design document.
- **Group (`GROUP`):** A persistent structural entity in the design document (`type: 'group'`) that binds children together until explicitly ungrouped. It survives autosave, reload, and order snapshots.

Multi-selection is not merely a hidden step to create a group. Non-designers can freely select several items, move or delete them together, and exit without polluting the document with artificial groups.

---

## 2. Architecture & Data Model

### 2.1 Separation of Concerns: Document vs Editor State

```text
┌─────────────────────────────────────────────────────────────┐
│                    Editor State (Transient)                 │
│  - selectionMode: 'default' | 'multi-select' | 'group-edit' │
│  - selectedElementIds: string[]                             │
│  - activeGroupId: string | null                             │
│  - temporaryCombinedBounds / gestureTransform               │
└──────────────────────────────┬──────────────────────────────┘
                               │ Commits mutations
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 DesignState (Document Model)                │
│  - elements: CanvasElement[]                                │
│    ├─ Element A (parentGroupId?: string)                    │
│    ├─ Element B (parentGroupId?: string)                    │
│    └─ GroupElement (type: 'group', data: { childIds: [] })  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Document Model Extension (`src/lib/product-state.ts`)

```typescript
export interface GroupElementData {
  childIds: string[];
}

export interface CanvasElement {
  id: string;
  type: 'image' | 'text' | 'shape' | 'sticker' | 'group';
  name?: string;
  x: number;       // Center X in % (0..100) or px
  y: number;       // Center Y in % (0..100) or px
  width: number;   // Width
  height: number;  // Height
  rotation: number;// Degrees 0..360
  locked?: boolean;
  zIndex?: number;
  parentGroupId?: string;
  surface?: 'front' | 'inside';
  data?: Record<string, unknown>;
}
```

### 2.3 Semantic Document Actions

1. `GROUP_ELEMENTS`: Creates a new `CanvasElement` with `type: 'group'`, sets `parentGroupId` on selected children, and positions the group at the combined bounding box.
2. `UNGROUP_ELEMENT`: Removes the group container, clears `parentGroupId` on children, and preserves absolute world coordinates and z-indices.
3. `MOVE_ELEMENTS`: Moves an array of elements by `(dx, dy)`.
4. `RESIZE_ELEMENTS`: Scales an array of elements uniformly based on the combined bounding box transform.
5. `ROTATE_ELEMENTS`: Rotates an array of elements around their combined center.
6. `DUPLICATE_ELEMENTS`: Duplicates all selected elements (and group hierarchy if group selected) with a visual offset (+4%, +4%).
7. `DELETE_ELEMENTS`: Deletes selected elements. Deleting a group deletes its member children in one step.

---

## 3. Interaction Flow & State Machine

### 3.1 Entry Points to Multi-Select

1. **From Canvas Contextual Toolbar:**
   - User taps an editable object &rarr; toolbar shows `•••` &rarr; taps `Chọn nhiều`.
   - Enters `MULTI_SELECT` mode.
   - The initially selected object remains the first selected item in `selectedElementIds`.
2. **From Layers Sheet:**
   - User opens `Lớp` &rarr; taps `Chọn nhiều` button in the header.
   - Enters `MULTI_SELECT` mode.
   - If an element was selected in layers, it stays selected.

Both entry points activate the exact same canonical state (`selectionMode = 'multi-select'`). Canvas and Layers always reflect the identical selection set.

### 3.2 Tap Selection in Multi-Select Mode

- **Tap unselected editable object:** Adds object ID to `selectedElementIds`.
- **Tap selected object:** Removes object ID from `selectedElementIds`.
- **Zero selected objects:** The editor remains in `MULTI_SELECT` mode, displaying `0 mục đã chọn`. It does **not** auto-exit.
- **Tap locked object:** Shows feedback toast: `"Thành phần này đã bị khóa trong mẫu."` Does not add to selection.
- **Surface constraint:** Elements can only be selected from the active surface (e.g. Card front vs inside).

### 3.3 Movement vs Tap Disambiguation

Inside `MULTI_SELECT`, tapping a selected item toggles selection **only** if the pointer does not move beyond `TAP_THRESHOLD_PX` (6px).
- If pointer moves > 6px: The gesture is locked as a **Combined Move Transform**.
- On pointer up: No tap toggle is dispatched; the new positions are committed.

### 3.4 Combined Bounding Box & Gestures

- **Per-item feedback:** Subtle thin outline on each selected object.
- **Combined selection boundary:** Exactly **one** outer bounding box surrounding all selected items with:
  - 4 corner resize handles (touch area 44×44px).
  - 1 rotation stem & handle at the top.
- **Move:** Dragging anywhere inside the combined bounding box translates all selected children together.
- **Resize:** Dragging any corner handle scales the selection uniformly around the combined center. Child positions and sizes scale proportionally.
- **Rotate:** Dragging the rotation handle orbits child centers around the combined center and increments child rotation angles.
- **Canvas pan/pinch:** Pinching zoom and panning outside the bounding box continue to operate the canvas viewport normally.

---

## 4. Grouping & Group Lifecycle

### 4.1 Creating a Group

- When `selectedElementIds.length >= 2` editable items on the same surface:
  - The `Nhóm` button in the toolbar is enabled.
- User taps `Nhóm`:
  - Dispatches `GROUP_ELEMENTS`.
  - Exits `MULTI_SELECT` mode.
  - Automatically selects the newly created group (`selectedElementId = newGroupId`, `selectedTarget = 'group'`).
  - History commits exactly 1 entry: `"Tạo nhóm đối tượng"`.

### 4.2 Group Selection & Behavior

- **Single tap on any child:** Selects the Group as a whole unit (`GROUP_SELECTED`).
- **Group transforms:** Moving, resizing, rotating, duplicating, or deleting the group acts on all children simultaneously.
- **Locked group:** If a group is locked, it cannot be transformed, ungrouped, or edited.

### 4.3 Group Edit Mode (`GROUP_EDIT`)

- **Double tap on Group (or tap child row in Layers):** Enters `GROUP_EDIT` mode.
- **Visual context:** Displays a floating banner at top: `"Đang chỉnh nhóm"` with a `"Xong"` button.
- **Child selection:**
  - Tapping a child selects that specific child within the group.
  - Shows the contextual toolbar for that child (Text toolbar for text, Image toolbar for image).
  - Elements outside the active group are non-interactive.
  - Double-tapping text inside group opens the text edit overlay.
  - Tapping Replace Image replaces the image child while keeping group structure intact.
- **Exiting Group Edit:**
  - Tapping `"Xong"` in the banner or bottom toolbar, or pressing Back:
  - Exits `GROUP_EDIT` mode back to Group selected. Does **not** ungroup.

### 4.4 Ungrouping

- When a Group is selected &rarr; user taps `•••` &rarr; taps `Bỏ nhóm`.
- Dispatches `UNGROUP_ELEMENT`.
- Children become independent top-level elements.
- The former children remain selected as a temporary multi-selection.
- History commits exactly 1 entry: `"Bỏ nhóm đối tượng"`.

---

## 5. UI Layout & Controls

### 5.1 Multi-select Bottom Toolbar

When `selectionMode === 'multi-select'`, replaces normal toolbars:

```text
┌─────────────────────────────────────────────────────────────┐
│ [←]   3 mục đã chọn   [Nhóm] [Nhân bản] [Xóa] [•••]  [Xong] │
└─────────────────────────────────────────────────────────────┘
```

- `Xong` / `←`: Exits multi-select mode, clears selection, returns to default editor state.
- `Nhóm`: Enabled only when `>= 2` items selected.
- `Nhân bản`: Duplicates all selected items with slight offset.
- `Xóa`: Deletes all selected items in one step.
- `•••`: Opens More Sheet with structural actions only:
  - `Khóa đối tượng` (Lock)
  - `Đưa lên trên` (Bring Forward)
  - `Đưa xuống dưới` (Send Backward)

### 5.2 Layers Sheet Multi-select & Hierarchy

- **Header button:** `[Chọn nhiều]` toggles multi-select mode within Layers.
- **Indentation:** Group rows display a folder icon and expand/collapse chevron. Group children are indented with a subtle vertical connector line.
- **Direct entry:** Tapping a child under an expanded group in Layers enters `GROUP_EDIT` focused on that child.

---

## 6. History, Autosave & Rollback Contract

| Action | Creates Undo History? | Triggers Autosave? |
|---|---|---|
| Enter / Exit Multi-select | No | No |
| Toggle element in selection | No | No |
| Move multi-selection gesture | Yes (1 action on release) | Yes |
| Resize multi-selection gesture | Yes (1 action on release) | Yes |
| Rotate multi-selection gesture | Yes (1 action on release) | Yes |
| Group elements (`Nhóm`) | Yes (1 action) | Yes |
| Ungroup elements (`Bỏ nhóm`)| Yes (1 action) | Yes |
| Duplicate selection | Yes (1 action) | Yes |
| Delete selection | Yes (1 action) | Yes |
| Enter / Exit Group Edit | No | No |

---

## 7. Explicit Non-Goals & MVP Boundaries

1. **No Marquee / Drag-box Selection:** Mobile screens prioritize tap-based multi-selection. Marquee is deferred for tablet/desktop future releases.
2. **No Drag-and-Drop Hierarchy Editing:** Dragging items into or out of groups via gestures is strictly excluded. Re-grouping uses `Bỏ nhóm` &rarr; re-select &rarr; `Nhóm`.
3. **No Bulk Formatting:** Bulk font, color, opacity, mask, or crop editing across mixed types is excluded.
4. **No Alignment / Distribution Tools:** Snap alignment and spacing tools remain excluded from MVP.
5. **No Deep Nesting Optimization:** Nested groups are shallowly supported by data model but UI discourages deep nesting.
