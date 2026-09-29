# State 33: Preflight UX Design Specification

## 1. Overview & Core Philosophy
Preflight is the final automated design-quality checkpoint before the customer enters Checkout.
It answers one question:
**“Thiết kế này đã đủ ổn để đặt hàng chưa?”**
- Guiding principle: **"Find problems automatically, explain them simply, and take the customer directly to the place that needs fixing."**
- Non-designer friendly: no technical prepress diagnostics, DPI/PPI metrics, trim tolerance, or contour graph terminology.
- Belongs to the Editor flow: full-screen focused mode, entered from `Xong` (from Editor or after Preview).
- Exiting Preflight:
  - `Tiếp tục` (passes or acknowledged warnings) -> progresses to Checkout.
  - `Quay lại sửa` or `←` -> returns cleanly to Editor.
  - `[ Sửa ]` on an issue card -> direct navigation to the exact surface, selects the exact element, and highlights the issue.

## 2. Customer Mental Model & Overall Statuses
Three clear, high-level states:
1. **`Sẵn sàng` (Pass):**
   - Title: `Thiết kế đã sẵn sàng`
   - Subtitle: `Mọi thứ trông ổn để tiếp tục đặt hàng.`
   - Primary action: `Tiếp tục` (enabled, prominent `#315F86`).
   - Clean view: collapsed pass checks summary (`✓ 4 kiểm tra đã đạt tiêu chuẩn`).
2. **`Cần kiểm tra` (Warning):**
   - Title: `Có một vài chỗ cần kiểm tra`
   - Subtitle: `Bạn có thể sửa các chi tiết dưới đây hoặc vẫn tiếp tục nếu thấy ổn.`
   - Actionable issue cards with `[ Sửa ]` button.
   - Primary action: `Tiếp tục đặt in` (or `Vẫn tiếp tục`) enabled, allowing customer to proceed if they accept the warning.
3. **`Cần sửa` (Blocking / Error):**
   - Title: `Cần sửa trước khi tiếp tục`
   - Subtitle: `Vui lòng sửa các điểm dưới đây để đảm bảo chất lượng thành phẩm.`
   - Primary action: `Tiếp tục` is disabled with notice: `Vui lòng sửa các điểm cần khắc phục trước khi tiếp tục.`

## 3. Issue Card Design & Content
- Compact actionable card per finding:
  - Icon: `AlertTriangle` (amber for warning, red for error).
  - Title: plain Vietnamese label (e.g. `Ảnh có thể hơi mờ`, `Chi tiết đang sát mép`, `Chi tiết quan trọng đang gần nếp gấp`, `Khá gần gáy`, `Một số phần của sticker đang tách rời`).
  - Description: helpful customer explanation.
  - Action button: `[ Sửa ]` (`outline` button with edit icon).
- Reminders:
  - General content review reminder: `Kiểm tra lại chữ, tên, ngày tháng và thông tin quan trọng trước khi đặt in.`

## 4. Direct Navigation Contract (`Direct Fix`)
When user taps `[ Sửa ]` on an issue:
1. Close Preflight mode (`overlayMode = null`).
2. If `surfaceId` is present and product is multi-surface (e.g. Card with `inside`, `front`, `back`):
   - Switch active surface to `surfaceId` (`setActiveCardSurface(surfaceId)`).
3. If `elementId` is present:
   - Select the target element (`setSelectedElementId(elementId)`, `setSelectedTarget(type)`).
4. Visual feedback:
   - If issue is Safe Area / Fold / Binding: automatically enable/highlight safe area guide (`setShowSafeAreaGuide(true)`).
   - If issue is Image Quality: image selection badge and transform box will highlight the image status.

## 5. Aggregated Rule Sources
Preflight unifies checks from existing domain services:
- **Image Quality (State 30):** evaluated across all surfaces for effective physical PPI.
- **Safe Area (State 31):** evaluated for important content encroaching 4% outer margin, card fold corridor (±3%), and notebook binding margin (12%).
- **Sticker Contour (State 27):** checks for empty sticker, disconnected islands, or tiny details in die-cut stickers.
- **Notebook Cover (State 29):** empty cover check and binding zone check.
- **Missing Asset:** detection of invalid or unloadable source images.
- **Empty Design:** detection of completely blank projects.

## 6. Non-goals & Exclusions
- NO spellchecking AI or automatic grammar evaluation.
- NO CMYK or printer-specific rasterization previews.
- NO blocking checkouts for mild image resolution or decorative elements extending to edge.
- NO history actions created by entering Preflight or acknowledging warnings.
