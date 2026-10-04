# State 44: Product Catalog, Variant Management & Pricing Admin Runbook

Tài liệu vận hành, phân quyền bảo mật, kiến trúc định danh, phiên bản thương mại bất biến, chính sách thanh toán cọc/trả thẳng, quy tắc sản xuất và cẩm nang xử lý sự cố cho Hệ thống Quản trị Danh mục Sản phẩm & Giá bán (State 44).

---

## 1. Tổng quan Kiến trúc: Code-Owned Registry vs Supabase Commercial Catalog

Hệ thống quản lý danh mục và giá sản phẩm phân định ranh giới trách nhiệm tuyệt đối giữa **Code-Owned Structural Registry** và **Database Commercial Catalog**:

```
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                     CODE-OWNED STRUCTURAL REGISTRY                           │
 │                     (src/lib/product-definition-registry.ts)                 │
 │  - Kích thước vật lý (mm, pixel, bleed, fold margin)                        │
 │  - Cấu trúc bề mặt in ấn (surfaces, single-sheet, 3-surface folded card)     │
 │  - Kiểm định file in & vùng an toàn (preflight, safe-area, safe zones)       │
 │  - Công cụ hiển thị (renderer, canvas engine, preview dialog)                │
 │  - Khóa tương thích mẫu thiết kế chính xác (exact template targets)          │
 └──────────────────────────────────────┬───────────────────────────────────────┘
                                        │ (Ràng buộc hợp lệ definition_key)
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                    SUPABASE COMMERCIAL CATALOG (DATABASE)                    │
 │               (products, product_variants, commercial_config)                │
 │  - Vòng đời nghiệp vụ: draft, active, archived                               │
 │  - Tên gọi, mô tả marketing, nhãn hiển thị tiếng Việt                        │
 │  - Mạng lưới số lượng: minimum_quantity, quantity_step, maximum_quantity     │
 │  - Bậc giá theo thể tích: commercial_pricing_tiers (VND nguyên)              │
 │  - Chính sách thanh toán: full_payment, fixed_deposit                         │
 │  - Phiên bản thương mại bất biến: product_commercial_config_versions         │
 └──────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
      ┌───────────────────────────┐           ┌───────────────────────────┐
      │   Khách hàng (Storefront) │           │    Quản trị viên (Admin)  │
      │ - Chỉ duyệt sản phẩm bán  │           │ - Soạn thảo nháp giá bán  │
      │   được (browseSellable)   │           │   (product_commercial_    │
      │ - Nhận báo giá máy chủ    │           │    drafts)                │
      │   (ProductPriceQuote 15m) │           │ - Xuất bản nguyên tử      │
      │ - Đơn hàng chụp kinh tế   │           │   (publish_product_       │
      │   bất biến (OrderSnapshot)│           │    commercial_config)     │
      └───────────────────────────┘           └───────────────────────────┘
```

### Ranh giới trách nhiệm cốt lõi:
1. **Mã nguồn (Code) sở hữu hình học & kỹ thuật:**
   - Mã nguồn xác định kích thước chính xác, số lượng mặt in, kiểu gập, vùng gáy sổ, khuôn bế sticker, thuật toán preflight và tương thích template 14 khóa mục tiêu của State 43.
   - **Quy tắc cấm (Anti-pattern):** Cơ sở dữ liệu Supabase tuyệt đối **không** lưu trữ kích thước tùy ý, hàm vẽ Canvas, thuật toán cắt bế, tham số renderer hoặc các biến thể do người dùng tự định nghĩa.
2. **Cơ sở dữ liệu (Supabase) sở hữu thương mại & vòng đời:**
   - Supabase quản lý thông tin thương mại: trạng thái mở bán, hiển thị, mức giá theo số lượng, chính sách thanh toán và bản chụp giao dịch.
   - Toàn bộ tính toán giá và xác thực đơn hàng đều chạy trên máy chủ (Server-side Validation) dựa trên phiên bản thương mại đang hoạt động.

---

## 2. Định danh Sản phẩm, Biến thể & Tính bất biến Cấu trúc (Structural Immutability)

### Bảng định danh chuẩn (Canonical IDs):
Hệ thống sử dụng các khóa định danh chuỗi ổn định (Stable String IDs) đã liên kết chặt chẽ với template và đơn hàng từ State 37 đến State 44:

| Dòng sản phẩm (`product_id`) | Biến thể (`variant_id`) | Khóa định nghĩa mã nguồn (`definition_key`) | Quy cách vật lý chuẩn |
|---|---|---|---|
| `wrapping` (Giấy gói) | `a1` | `wrapping:a1` | Khổ A1 (594 × 841 mm), họa tiết hoặc toàn khổ |
| `wrapping` (Giấy gói) | `a2` | `wrapping:a2` | Khổ A2 (420 × 594 mm), họa tiết hoặc toàn khổ |
| `card` (Thiệp chúc mừng) | `horizontal` | `card:horizontal` | Thiệp ngang gập đôi (148 × 105 mm gập), 3 mặt in |
| `card` (Thiệp chúc mừng) | `vertical` | `card:vertical` | Thiệp đứng gập đôi (105 × 148 mm gập), 3 mặt in |
| `sticker` (Nhãn dán) | `die-cut` | `sticker:die-cut` | Cắt bế theo đường nét ảnh (50 × 50 mm) |
| `sticker` (Nhãn dán) | `fixed-shape` | `sticker:fixed-shape` | Hình học cố định (Tròn, Vuông, Chữ nhật, Bo góc, Tim) |
| `sticker` (Nhãn dán) | `phone` | `sticker:phone` | Decal dán lưng điện thoại tiêu chuẩn |
| `notebook` (Bìa sổ tay) | `standard` | `notebook:standard` | Bìa cứng A5 (148 × 210 mm), vùng an toàn gáy 12% |

### Tính bất biến cấu trúc một chiều (Structural Immutability):
- Bảng `products` và `product_variants` được bảo vệ bằng trigger `enforce_product_structural_immutability`.
- Khi một biến thể đã có đơn hàng (`orders`), dự án (`projects`), hoặc mẫu thiết kế (`templates`) tham chiếu:
  - Cấm thay đổi `definition_key`.
  - Cấm chuyển biến thể sang `product_id` khác.
  - Cấm xóa cứng (`DELETE`) bản ghi khỏi cơ sở dữ liệu.
- **Quy tắc nâng cấp cấu trúc:** Nếu xưởng in thay đổi quy cách vật lý (ví dụ: đổi kích thước khổ sổ hoặc thêm mặt in), lập trình viên phải khai báo một `definition_key` mới trong mã nguồn và tạo biến thể mới tương ứng trong cơ sở dữ liệu, không ghi đè lên cấu hình cũ.

---

## 3. Vòng đời Sản phẩm & Biến thể: Browse Khách hàng vs Tra cứu Lịch sử

Cả Sản phẩm (`products`) và Biến thể (`product_variants`) đều vận hành theo 3 trạng thái vòng đời:

```
               ┌──────────┐
               │  draft   │ (Đang cấu hình, chưa mở bán)
               └────┬─────┘
                    │ Kích hoạt (Yêu cầu đầy đủ cấu hình)
                    ▼
               ┌──────────┐
  Khôi phục ◄──┤  active  │ (Đang mở bán trên cửa hàng)
               └────┬─────┘
                    │ Lưu trữ (Ngừng kinh doanh)
                    ▼
               ┌──────────┐
               │ archived │ (Lưu trữ vĩnh viễn, bảo toàn lịch sử)
               └──────────┘
```

### 1. Duyệt danh mục mở bán (`browseSellableProducts`):
- Khách hàng duyệt cửa hàng chỉ nhìn thấy sản phẩm thỏa mãn:
  - `products.status = 'active'`
  - `products.current_commercial_config_version_id IS NOT NULL`
  - Các biến thể hiển thị kèm theo bắt buộc phải có `product_variants.status = 'active'` và có quy tắc định giá trong phiên bản thương mại hiện hành.
- Sản phẩm hoặc biến thể ở trạng thái `draft` hoặc `archived` bị loại bỏ hoàn toàn khỏi danh mục khách hàng.

### 2. Tra cứu lịch sử (`resolveProductById`, `resolveVariantById`):
- Đơn hàng cũ, dự án đã lưu trong tài khoản, mẫu thiết kế lịch sử và xưởng in cần đọc thông tin của các sản phẩm đã ngừng bán.
- Hàm giải quyết lịch sử trả về đầy đủ bản ghi ngay cả khi sản phẩm hoặc biến thể mang trạng thái `archived`.
- Điều này đảm bảo:
  - Khách hàng xem lại lịch sử đơn hàng không bị lỗi màn hình trắng (Blank screen / 404).
  - Quản trị viên và xưởng in vẫn có thể xem chi tiết đơn hàng, xuất file in và hoàn tất sản xuất.

### 3. Ràng buộc lưu trữ an toàn (Safe Archiving Rules):
- Cấm xóa cứng: Mọi hành động ngừng kinh doanh đều chuyển trạng thái thành `archived`.
- Cấm lưu trữ biến thể cuối cùng: Một sản phẩm `active` không thể lưu trữ biến thể đang hoạt động cuối cùng của nó (báo lỗi `CANNOT_ARCHIVE_LAST_ACTIVE_VARIANT`). Muốn ngừng bán hoàn toàn, quản trị viên phải lưu trữ sản phẩm chính trước.

---

## 4. Phiên bản Thương mại Bất biến & Quy trình Xuất bản Nguyên tử

Toàn bộ thông số thương mại (chính sách thanh toán, bước nhảy số lượng, bảng giá bậc thang) đều được đóng gói thành các phiên bản bất biến (`product_commercial_config_versions`).

### Không gian làm việc nháp (`product_commercial_drafts`):
- Mỗi sản phẩm có một bản ghi nháp để quản trị viên điều chỉnh giá và quy tắc mà không ảnh hưởng tới khách hàng đang mua sắm.
- Bản nháp được bảo vệ bằng cơ chế khóa lạc quan (Optimistic Concurrency Control):
  - Trường `revision` tăng đơn điệu mỗi lần lưu tự động (`save_product_commercial_draft`).
  - Nếu hai quản trị viên cùng mở một sản phẩm, người gửi yêu cầu sau với `expected_draft_revision` cũ sẽ bị từ chối (`REVISION_CONFLICT`).

### Quy trình xuất bản nguyên tử (`publish_product_commercial_config`):
Hàm RPC `publish_product_commercial_config` thực thi nguyên tử trong một transaction duy nhất:
1. **Xác thực quyền hạn:** Bắt buộc vai trò `admin` trong bảng `staff_roles`.
2. **Kiểm tra khóa lạc quan:** So khớp đồng thời `expected_product_revision` của sản phẩm và `expected_draft_revision` của bản nháp.
3. **Kiểm tra tính hợp lệ nghiệp vụ:**
   - Mỗi biến thể đang bán phải có `minimum_quantity >= 1` và `quantity_step >= 1`.
   - Bắt buộc có bậc giá tương ứng với `minimum_quantity`.
   - Nếu áp dụng đặt cọc (`fixed_deposit`), số tiền cọc phải nhỏ hơn hoặc bằng tổng tiền nhỏ nhất có thể đặt của mọi biến thể.
4. **Tạo bản chụp phiên bản:**
   - Tăng `version_number` lên 1 (ví dụ: v1 -> v2).
   - Thêm bản ghi vào `product_commercial_config_versions`, `commercial_variant_rules`, và `commercial_pricing_tiers`.
5. **Chuyển con trỏ xuất bản:** Cập nhật `products.current_commercial_config_version_id` trỏ tới phiên bản mới vừa tạo.
6. **Dọn dẹp & Ghi nhật ký:** Xóa bản nháp trong `product_commercial_drafts` và ghi nhận sự kiện `commercial_config_published` vào bảng `asset_events`.

### Bảo vệ bất biến (Trigger-Enforced Immutability):
- Ba trigger: `reject_commercial_version_mutation`, `reject_commercial_rule_mutation`, và `reject_commercial_tier_mutation` chặn mọi thao tác `UPDATE` và `DELETE` trên các phiên bản đã xuất bản.
- Khi cần cập nhật giá hoặc sửa sai, quản trị viên bắt buộc phải tạo nháp mới và xuất bản phiên bản tiếp theo (`v3`, `v4`...).

---

## 5. Số học Tiền tệ VND, Mạng lưới Số lượng & Bậc giá Thể tích

### 1. Số học Tiền tệ nguyên VND (Integer VND):
- Mọi giá trị tiền tệ trong hệ thống (`price`, `unit_price`, `amount`, `subtotal`, `total`, `amount_due_now`, `remaining_amount`) đều là số nguyên VND (Integer).
- Tuyệt đối cấm số thực (floating point), cấm giá trị âm và không hỗ trợ các đơn vị xu/hào phân đoạn.
- Định dạng tiền tệ hiển thị thống nhất qua hàm `formatCurrencyVND(amount)` (ví dụ: `70.000 ₫`).

### 2. Mạng lưới Số lượng (Quantity Lattice):
Số lượng đặt in của khách hàng phải thỏa mãn công thức lưới số học:
$$\text{quantity} \ge \text{minimum\_quantity}$$
$$(\text{quantity} - \text{minimum\_quantity}) \pmod{\text{quantity\_step}} = 0$$
$$\text{quantity} \le \text{maximum\_quantity} \quad (\text{nếu có})$$

Ví dụ: Với `minimum_quantity = 5`, `quantity_step = 5`, các số lượng hợp lệ là `5, 10, 15, 20...`. Số lượng `7` hoặc `12` sẽ bị máy chủ từ chối ngay lập tức (`INVALID_QUANTITY`).

### 3. Bậc giá theo Thể tích (Volume Pricing Tiers):
- Hệ thống áp dụng mức giá phẳng (Flat-rate volume pricing) cho toàn bộ đơn hàng dựa trên bậc số lượng cao nhất đạt được, **không** tính theo bậc lũy tiến chia nhỏ (no graduated pricing).
- Ví dụ bảng giá:
  - Bậc 1: từ 5 sản phẩm -> đơn giá 65.000 ₫
  - Bậc 2: từ 20 sản phẩm -> đơn giá 60.000 ₫
- Nếu khách đặt số lượng 20 chiếc:
  $$\text{Tổng tiền} = 20 \times 60.000 = 1.200.000\text{ ₫}$$
  (Toàn bộ 20 chiếc đều tính giá 60.000 ₫, không chia 5 chiếc đầu giá 65.000 ₫).

### 4. Suy xuất Giá khởi điểm (Starting Price Derivation):
- Giá khởi điểm hiển thị trên trang chủ và danh mục sản phẩm (`startingPrice`) không nhập tay trong metadata để tránh sai lệch dữ liệu.
- Giá khởi điểm được tự động suy xuất bằng:
  $$\text{startingPrice} = \min_{\text{active variants}} (\text{unit\_price ở minimum\_quantity})$$

---

## 6. Chính sách Thanh toán, Báo giá Máy chủ (Quote TTL), Bản chụp Đơn hàng & Mục đích Thanh toán

### 1. Hai loại Chính sách Thanh toán:
1. **Trả thẳng toàn bộ (`full_payment`):**
   - $\text{amount\_due\_now} = \text{total}$
   - $\text{remaining\_amount} = 0$
2. **Đặt cọc cố định (`fixed_deposit`):**
   - $\text{amount\_due\_now} = \text{depositAmount}$
   - $\text{remaining\_amount} = \text{total} - \text{depositAmount}$

### 2. Kiểm định Hợp lệ khi Xuất bản Đặt cọc:
Để bảo vệ hệ sinh thái khỏi việc thu cọc vượt quá giá trị đơn hàng, quy trình xuất bản kiểm tra nghiêm ngặt:
$$\text{depositAmount} \le \min_{\text{all sellable variants, all tiers}} (\text{tier.minimum\_quantity} \times \text{tier.unit\_price})$$
Nếu quản trị viên nhập mức cọc 500.000 ₫ trong khi có biến thể cho phép đặt số lượng tối thiểu với tổng tiền 150.000 ₫, hệ thống sẽ từ chối xuất bản (`INVALID_DEPOSIT_POLICY`).

### 3. Báo giá Máy chủ & Thời hạn hiệu lực (Quote TTL):
- Khách hàng không gửi số tiền từ trình duyệt lên để tạo đơn hàng.
- Trình duyệt yêu cầu máy chủ cấp báo giá (`ProductPriceQuote`) có chữ ký và thời hạn hiệu lực **15 phút** (`expiresAt`).
- Khi khách hàng nhấn "Đặt hàng":
  - Máy chủ kiểm tra `expiresAt`. Nếu báo giá đã quá hạn, hệ thống yêu cầu làm mới báo giá (`EXPIRED_QUOTE`).
  - Màn hình Checkout tự động làm mới báo giá và cập nhật lại số tiền cho khách mà vẫn bảo toàn nguyên vẹn bản vẽ thiết kế (`design_document`) và thông tin liên hệ/giao hàng.

### 4. Bản chụp Đơn hàng Bất biến (Order Snapshot):
Khi đơn hàng được khởi tạo thành công, toàn bộ dữ liệu kinh tế được chụp lại vĩnh viễn:
- `product_snapshot` và `variant_snapshot`: Lưu tên, slug, quy cách tại thời điểm mua.
- `commercial_config_version_id`: Lưu khóa UUID của phiên bản thương mại được áp dụng.
- `applied_tier_minimum_quantity`, `unit_price`, `quantity`, `subtotal`, `total`, `amount_due_now`, `remaining_amount`.
- **Nguyên tắc bảo vệ:** Khi xưởng in tăng giá hoặc đổi phiên bản sang v2, các đơn hàng cũ tạo từ v1 **tuyệt đối không bị tính lại giá**.

### 5. Mục đích Thanh toán (`order_payments.purpose`):
Bảng `order_payments` phân định rõ mục đích của giao dịch:
- `full_order_payment`: Thanh toán toàn bộ giá trị đơn hàng.
- `checkout_deposit`: Thanh toán tiền cọc ban đầu tại checkout.
- Ràng buộc duy nhất tổng hợp `UNIQUE(order_id, purpose)` ngăn chặn việc ghi đè hoặc xác nhận trùng lặp giao dịch.

---

## 7. Điều kiện Sẵn sàng Sản xuất & Giới hạn Phạm vi

### Quy tắc Sẵn sàng Sản xuất (Production Readiness Matrix):
Hàm RPC `start_order_production` (được cắt chuyển hoàn toàn trong Migration 0018) kiểm tra điều kiện sẵn sàng:

| Chính sách thanh toán | Trạng thái thanh toán yêu cầu | Điều kiện thiết kế | Điều kiện tạm giữ (`hold`) | Cho phép sản xuất? |
|---|---|---|---|:---:|
| `full_payment` | `pending_payment` / `payment_reported` | Bất kỳ | Không có | **CHẶN** |
| `full_payment` | `paid` | `approved` | Không có | **CHO PHÉP** |
| `fixed_deposit` | `pending_payment` / `payment_reported` | Bất kỳ | Không có | **CHẶN** |
| `fixed_deposit` | `deposit_confirmed` | `approved` | Không có | **CHO PHÉP** |
| `fixed_deposit` | `paid` | `approved` | Không có | **CHO PHÉP** |
| Bất kỳ | Đã thanh toán | Chưa duyệt (`draft` / `submitted`) | Không có | **CHẶN** |
| Bất kỳ | Đã thanh toán | `approved` | Đang có lệnh giữ | **CHẶN** |

### Giới hạn Phạm vi Hoãn lại (Deferred Scope):
- State 44 tập trung vào việc quản trị danh mục, báo giá số lượng, đặt cọc và kích hoạt lệnh sản xuất khi cọc thành công.
- Các nghiệp vụ: Thu số tiền còn lại sau sản xuất (`remaining_balance`), cổng đối soát công nợ giao hàng khi nhận hàng (COD phần còn lại), xuất hóa đơn tài chính và hoàn trả cọc được chủ động đưa vào phạm vi hoãn lại (Deferred scope) cho phân hệ Tài chính/Kế toán tiếp theo.

---

## 8. Tính khả dụng của Mẫu thiết kế & Tương tác khi Lưu trữ (Template Compatibility)

Mẫu thiết kế (Templates) từ State 43 phụ thuộc vào các sản phẩm và biến thể đích cụ thể.

### Hành vi khi Lưu trữ (Archive Behavior):
1. **Khi một biến thể bị lưu trữ (`archived`):**
   - Giao diện Admin quản lý mẫu thiết kế chặn tạo mẫu mới cho biến thể đó.
   - Trình duyệt khách hàng ẩn các mẫu thiết kế thuộc biến thể đã lưu trữ.
   - Thao tác sao chép mẫu sang dự án mới (`template_use_draft` / `clone_template_to_project`) bị từ chối với mã lỗi `TARGET_NOT_SELLABLE`.
2. **Bảo toàn dữ liệu lịch sử:**
   - Các mẫu thiết kế đã xuất bản trước đây vẫn được lưu trong cơ sở dữ liệu.
   - Các dự án cá nhân (`projects`) đã tạo từ mẫu đó vẫn mở ra xem và chỉnh sửa được.
   - Đơn hàng đã đặt trước đó vẫn xem được thumbnail, thông số in và xuất file xưởng bình thường.

---

## 9. Ma trận Phân quyền & Ranh giới Bảo mật (RBAC & Security Model)

Hệ thống bảo vệ toàn diện với mô hình phòng thủ theo chiều sâu (Defense-in-Depth):

| Thao tác / Tài nguyên | Khách vãng lai (Anon) | Khách hàng đăng nhập | Biên tập viên (Editor) | Quản trị viên (Admin) |
|---|:---:|:---:|:---:|:---:|
| Duyệt danh mục sản phẩm đang mở bán | Có | Có | Có | Có |
| Yêu cầu cấp báo giá (`ProductPriceQuote`) | Có | Có | Có | Có |
| Đặt hàng và gửi thông báo thanh toán | Có | Có | Có | Có |
| Xem danh mục nháp & cấu hình giá nội bộ | Không | Không | Có | Có |
| Chỉnh sửa metadata sản phẩm (tên, mô tả) | Không | Không | Không | Có |
| Chuyển trạng thái sản phẩm/biến thể (active/archived) | Không | Không | Không | Có |
| Mở bản nháp cấu hình thương mại (`draft`) | Không | Không | Không | Có |
| Lưu thay đổi bản nháp thương mại | Không | Không | Không | Có |
| Xuất bản phiên bản thương mại mới | Không | Không | Không | Có |
| Xác nhận thanh toán (cọc hoặc toàn phần) | Không | Không | Không | Có |
| Bắt đầu lệnh sản xuất (`start_order_production`) | Không | Không | Không | Có |
| Đánh dấu hoàn tất sản xuất | Không | Không | Có | Có |

### Cơ chế bảo mật Supabase:
- **Thu hồi quyền trực tiếp:** Toàn bộ bảng `products`, `product_variants`, `product_commercial_config_versions`, `product_commercial_drafts`, `commercial_variant_rules`, `commercial_pricing_tiers` đều thu hồi quyền `INSERT`, `UPDATE`, `DELETE` từ `public`, `anon`, và `authenticated`.
- **RPC Bảo mật:** Toàn bộ các thao tác chỉnh sửa danh mục và xuất bản đều phải gọi qua các hàm RPC nội bộ (`SECURITY DEFINER`), tại đây hàm truy vấn trực tiếp bảng `staff_roles` để kiểm tra quyền `admin`. Nếu kẻ tấn công giả mạo token người dùng bình thường hoặc editor, RPC lập tức từ chối và trả về lỗi `FORBIDDEN`.

---

## 10. Thứ tự Triển khai Migration, Nạp dữ liệu Seed & Chiến lược Hoàn tác

### 1. Thứ tự Triển khai Migration (Forward Migrations):
Triển khai tuần tự các file SQL theo thứ tự phụ thuộc nghiêm ngặt:

```sh
# 1. Tạo bảng thương mại, mở rộng bảng products/variants, cài đặt triggers bất biến
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0010_state44_catalog_commercial.sql

# 2. Backfill dữ liệu legacy sang phiên bản v1, gắn definition_key, bảo toàn đơn hàng cũ
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0011_state44_catalog_backfill.sql

# 3. RPC quản trị thương mại: lưu nháp & xuất bản phiên bản nguyên tử
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0014_state44_catalog_operations.sql

# 4. Tinh chỉnh chữ ký RPC xuất bản và kiểm tra tham số nghiêm ngặt
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0015_state44_catalog_operations_publish_signature.sql

# 5. RPC quản trị danh mục: cập nhật metadata, kích hoạt & lưu trữ sản phẩm/biến thể
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0016_state44_admin_catalog_ui.sql

# 6. Mục đích thanh toán: mở rộng order_payments, RPC xác nhận thanh toán theo mục đích
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0017_state44_payment_purposes.sql

# 7. Cắt chuyển điều kiện sẵn sàng sản xuất: RPC start_order_production đọc chính sách & mục đích
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0018_state44_payment_readiness_cutover.sql
```

### 2. Nạp dữ liệu Seed phục vụ Phát triển & QA (`seed_state44.sql`):
```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_state44.sql
```
Bộ fixture mẫu trong `seed_state44.sql` bao gồm:
1. **`fixture-draft-product` / `fixture-draft-var`:** Sản phẩm và biến thể nháp chưa hoàn thiện cấu hình thương mại, minh họa danh sách lỗi chặn (`state44Blockers`).
2. **`fixture-active-full`:** Sản phẩm trả thẳng có 2 phiên bản thương mại:
   - Phiên bản 1 (lịch sử) kèm theo đơn hàng `QT44-V1-ORDER-01` khóa chặt vào giá và quy tắc của v1.
   - Phiên bản 2 (đang mở bán) có mạng lưới số lượng mới và đơn giá giảm theo bậc.
   - Biến thể lưu trữ `fixture-full-var-archived` minh họa việc loại bỏ biến thể cũ khỏi phiên bản mới.
3. **`fixture-active-deposit` / `fixture-deposit-var`:** Sản phẩm sticker áp dụng chính sách đặt cọc cố định 50.000 ₫ đã được kiểm định hợp lệ với các bậc giá, kèm theo đơn hàng `QT44-DEPOSIT-01` ở trạng thái `deposit_confirmed` và đang trong xưởng sản xuất (`in_production`).
4. **`fixture-archived-product` / `fixture-archived-var`:** Sản phẩm đã ngừng kinh doanh kèm theo Mẫu thiết kế lịch sử (`fixture-archived-template`), Thiết kế khách hàng và Đơn hàng lịch sử `QT44-ARCHIVED-01`.

### 3. Chiến lược Hoàn tác (Rollback Strategy):
Nếu phát sinh sự cố nghiêm trọng trên môi trường production, thứ tự hoàn tác phải đi ngược lại từ `0018` về `0010`:
1. Hoàn tác `0018`: Khôi phục hàm `start_order_production` cũ.
2. Hoàn tác `0017`: Khôi phục hàm `confirm_order_payment` cũ.
3. Hoàn tác `0016` & `0015` & `0014`: Thu hồi các hàm RPC quản trị danh mục.
4. **Lưu ý đặc biệt với bảng phiên bản:** Vì các bảng `product_commercial_config_versions` được cài đặt trigger bất biến, nếu kịch bản rollback cần xóa hoặc hoàn tác dữ liệu, bắt buộc phải thiết lập biến phiên làm việc:
   ```sql
   set local migration.allow_commercial_mutation = '1';
   ```
   trước khi thực hiện lệnh `DROP` hoặc `DELETE`.

---

## 11. Cẩm nang Xử lý Sự cố (Troubleshooting Guide)

| Mã lỗi / Hiện tượng | Nguyên nhân gốc rễ | Cách khắc phục |
|---|---|---|
| `INVALID_DEFINITION` | Quản trị viên cố gắng kích hoạt biến thể có `definition_key` không tồn tại trong `src/lib/product-definition-registry.ts`. | Kiểm tra lại mã nguồn. Đảm bảo quy cách kỹ thuật, bề mặt và render engine đã được lập trình và đăng ký trong Code Registry trước khi bật trên database. |
| `INVALID_PRICE` hoặc `PRICE_CALCULATION_FAILED` | Khách hàng chọn số lượng không nằm trên mạng lưới số học (`(quantity - min) % step != 0`) hoặc bảng giá thiếu bậc cho số lượng tối thiểu. | Kiểm tra cấu hình bậc giá trong bản nháp. Đảm bảo luôn có ít nhất một bậc giá tại chính xác `minimum_quantity`. |
| `INVALID_DEPOSIT_POLICY` | Số tiền đặt cọc cố định (`depositAmount`) lớn hơn tổng giá trị tối thiểu của một biến thể đang bán. | Giảm số tiền đặt cọc hoặc tăng số lượng đặt in tối thiểu của các biến thể sao cho `depositAmount <= min(min_qty * unit_price)`. |
| `STALE_DRAFT` hoặc `REVISION_CONFLICT` | Phiên bản bản nháp hoặc sản phẩm đã bị thay đổi bởi quản trị viên khác hoặc trong một phiên làm việc khác. | Tải lại trang quản trị (Reload) để lấy bản chụp dữ liệu mới nhất kèm `revision` hiện tại, sau đó thực hiện lại thao tác lưu/xuất bản. |
| `EXPIRED_QUOTE` | Khách hàng dừng ở bước thanh toán quá 15 phút, chữ ký báo giá của máy chủ đã hết hiệu lực. | Giao diện tự động gửi yêu cầu cấp báo giá mới (`re-quote`). Thiết kế và thông tin nhận hàng của khách vẫn được giữ nguyên. |
| `ARCHIVED_VARIANT` hoặc `VARIANT_NOT_SELLABLE` | Khách hàng cố gắng đặt hàng hoặc yêu cầu báo giá cho một biến thể đã bị chuyển sang trạng thái lưu trữ (`archived`). | Thông báo cho khách hàng rằng quy cách sản phẩm này đã ngừng cung cấp và gợi ý chọn biến thể đang mở bán khác. |
| `CANNOT_ARCHIVE_LAST_ACTIVE_VARIANT` | Quản trị viên cố lưu trữ biến thể `active` cuối cùng của một sản phẩm vẫn đang `active`. | Nếu muốn ngừng kinh doanh sản phẩm, hãy chuyển trạng thái của sản phẩm chính sang `archived` trước. |
| `DENIED_ROLE` hoặc `FORBIDDEN` | Tài khoản đăng nhập mang vai trò `editor` hoặc tài khoản thường cố tình gọi RPC cập nhật danh mục, xuất bản giá hoặc xác nhận tiền. | Kiểm tra bảng `staff_roles`. Thao tác quản trị danh mục thương mại và tiền tệ yêu cầu bắt buộc quyền `admin`. |
| `ORDER_NOT_READY_FOR_PRODUCTION` | Xưởng in bấm bắt đầu sản xuất nhưng đơn hàng chưa đủ điều kiện (chưa duyệt thiết kế, chưa cọc/thanh toán, hoặc đang bị tạm giữ). | Kiểm tra chi tiết đơn hàng: Đảm bảo thiết kế đã `approved`, trạng thái thanh toán là `paid` (trả thẳng) hoặc `deposit_confirmed` (đặt cọc), và xóa lệnh tạm giữ nếu có. |
