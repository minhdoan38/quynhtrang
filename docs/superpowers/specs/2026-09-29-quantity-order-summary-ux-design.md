# State 34: Quantity + Order Summary UX Design Specification

## 1. Overview & Customer Mental Transition
State 34 marks the transition from design mode to ordering mode:
`CREATE` → `ORDER`
- Flow position: **Checkout Step 1 / 3**
  `Editor` → `Preflight` → **`Order Summary + Quantity` (Step 1)** → `Customer Information` (Step 2) → `QR Payment` (Step 3) → `Order Confirmation`.
- Guiding principle: **"Confirm what I am buying before asking who and where to send it to."**
- Dedicated Checkout environment:
  - Separate checkout screen removed from the canvas.
  - Zero editing chrome: no layers, tools, text edit, crop, or undo/redo.
  - Focused exclusively on confirming the product, design, quantity, and estimated subtotal.

## 2. Page Structure & Header (Mobile-First)
- **Top Header:**
  - Back action: `← Đơn hàng` (navigates back to Editor with design preserved).
  - Step indicator: `Bước 1 / 3` (`1. Tóm tắt đơn hàng` → `2. Thông tin nhận hàng` → `3. Hướng dẫn thanh toán`).
- **Main Content (Single compact mobile scroll):**
  1. Product & Design Summary Card.
  2. Quantity Selector Card.
  3. Pricing & Subtotal Breakdown.
- **Sticky Bottom Action Bar:**
  - Displays `Tạm tính: xxx.xxxđ` on the left.
  - Primary button: `Tiếp tục` with `ArrowRight` icon on the right (navigates to Step 2: Customer Information).

## 3. Product & Design Summary Card
- **Real Design Thumbnail:**
  - Renders the actual approved design from Preflight.
  - Product-shaped container:
    - Fixed Sticker: circular clipping for circle, rounded for rounded-rectangle, etc.
    - Die-cut Sticker: contour silhouette with white border.
    - Card: Front surface preview.
    - Wrapping Paper: flat full-sheet repeat layout.
    - Notebook: front cover A5 perspective preview.
  - Tapping thumbnail opens a clean full-screen preview modal without entering editor.
- **Product Information (Vietnamese):**
  - Product Title: `Giấy bọc quà`, `Thiệp chúc mừng`, `Sticker die-cut`, `Sticker tròn`, `Bìa sổ tay`.
  - Variant & Configuration: `A1 • Lặp họa tiết`, `Ngang (148 × 105 mm)`, `Dọc (105 × 148 mm)`, `Tròn 5 cm`, `Khổ A5`.
  - Trust badge: `✓ Thiết kế đã được kiểm tra` (confirming preflight passed).
  - Subtle action: `Chỉnh sửa thiết kế` (returns to Editor with state intact).

## 4. Mobile Quantity Selector
- **Generous Touch Stepper:**
  - `[-]` and `[+]` buttons with min 44x44px touch targets and accessible `aria-label="Giảm số lượng"` / `aria-label="Tăng số lượng"`.
  - Centered direct input with `inputMode="numeric"`, `pattern="[0-9]*"`.
  - Range validation: minimum 1, maximum 999.
  - Inline error message if user enters invalid input (e.g., `Số lượng tối thiểu là 1 bản.`).
- **Persistence:**
  - Selected quantity is saved to local storage/draft so navigating between steps or returning to editor does not reset it.
  - Does NOT mutate DesignDocument or create undo/redo history.

## 5. Pricing Engine & Subtotal (`src/lib/pricing.ts`)
- **Centralized `calculatePriceQuote`:**
  - Inputs: `productId`, `variantId`, `quantity`, `productOptions`.
  - Output: `unitPrice`, `subtotal`, `discountAmount`, `formattedSubtotal`, `formattedUnitPrice`.
- **Immediate Reactive Updates:**
  - Price recalculates synchronously upon quantity change.
  - Primary label: `Tạm tính: xxx.xxxđ` (Vietnamese currency format).
  - Secondary label: `(xx.xxxđ / sản phẩm)`.
  - Shipping note: `Phí vận chuyển sẽ được tính theo địa chỉ giao hàng ở bước tiếp theo.`

## 6. Explicit Non-Goals & Exclusions
- NO Customer Information collection in this step (Name, Phone, Address belong to Step 2).
- NO QR payment, bank details, or countdown (belong to Step 3).
- NO promo codes, shopping carts, or cross-sell popups in MVP.
- NO server order creation or asset upload at this step (occurs after customer info is provided).
