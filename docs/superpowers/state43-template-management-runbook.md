# State 43: Admin Template Management & Publishing Runbook

Tài liệu vận hành, phân quyền bảo mật, kiến trúc lưu trữ, quy trình xuất bản nguyên tử và cẩm nang xử lý sự cố cho Hệ thống Quản trị & Xuất bản Mẫu thiết kế (State 43).

---

## 1. Tổng quan Kiến trúc & Mô hình Dữ liệu

Hệ thống quản lý mẫu thiết kế tuân thủ nghiêm ngặt mô hình phân tầng **Template / TemplateDraft / TemplateVersion**, tách biệt hoàn toàn không gian làm việc nháp riêng tư với các phiên bản bất biến phục vụ khách hàng:

```
                  ┌──────────────────────────────────────────────┐
                  │          Template (Bản ghi danh mục)         │
                  │  id, name, slug, product_id, variant_id,     │
                  │  product_mode, fixed_sticker_shape, status,  │
                  │  revision, current_published_version_id      │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
   ┌───────────────────────────┐                   ┌───────────────────────────┐
   │       TemplateDraft       │                   │      TemplateVersion      │
   │   (Không gian làm việc)   │                   │    (Phiên bản bất biến)   │
   │ - Lưu nháp riêng tư       │                   │ - Bất biến tuyệt đối      │
   │ - Lease 120s / HB 30s     │   XUẤT BẢN        │ - document_schema_version │
   │ - Epoch fencing           │ ───────────────►  │ - SHA-256 document hash   │
   │ - Asset nháp trong bucket │   (Receipt probe) │ - Asset sao chép sang     │
   │   riêng tư template-drafts│                   │   bucket công khai        │
   └───────────────────────────┘                   └─────────────┬─────────────┘
                                                                 │
                                                  ┌──────────────┴──────────────┐
                                                  ▼                             ▼
                                        ┌───────────────────┐         ┌───────────────────┐
                                        │  Khách vãng lai   │         │  Khách đăng nhập  │
                                        │ (Guest Clone)     │         │  (Cloud Clone)    │
                                        │ - LocalStorage    │         │ - Bảng projects   │
                                        │ - Giới hạn 3/30   │         │ - working_document│
                                        │ - Use Receipt 15m │         │ - Idempotency key │
                                        └───────────────────┘         └───────────────────┘
```

### Các thực thể chuẩn (Canonical Entities):

1. **`templates` (Thực thể đại diện mẫu):**
   - Định danh duy nhất và con trỏ điều hướng tới phiên bản đang xuất bản (`current_published_version_id`).
   - Cố định sản phẩm mục tiêu (`product_id`, `variant_id`, `product_mode`, `fixed_sticker_shape`, `target_snapshot`). Khi đã khởi tạo, các thông số kỹ thuật in ấn là bất biến tuyệt đối (`IMMUTABLE_TEMPLATE_TARGET`).
   - Quản lý trạng thái vòng đời: `draft` (chưa từng xuất bản hoặc đang sửa), `published` (đang hiển thị cho khách), `archived` (đã lưu trữ).
   - Cơ chế kiểm soát ghi đồng thời: Số hiệu phiên bản tổng thể (`revision`) tăng đơn điệu mỗi lần xuất bản hoặc thay đổi thông tin an toàn.

2. **`template_drafts` (Bản nháp làm việc riêng tư):**
   - Mỗi mẫu có tối đa 1 bản nháp hoạt động tại một thời điểm (`UNIQUE(template_id)`).
   - Khóa phiên làm việc độc quyền (Lease Lock): Thời hạn thuê 120 giây, nhịp tim duy trì (Heartbeat) định kỳ 30 giây.
   - Chống ghi đè xung đột (Epoch & Revision CAS): Kiểm tra `expected_revision` khi lưu tự động (Autosave). Khi chiếm quyền biên tập (takeover), `lock_epoch` tăng lên để vô hiệu hóa ngay lập tức các phiên cũ.
   - Tài nguyên ảnh nháp lưu trong bucket riêng tư `template-drafts` và được ghi nhận trong `template_assets`.

3. **`template_versions` (Phiên bản xuất bản bất biến):**
   - Chỉ được tạo thông qua giao dịch xuất bản nguyên tử (`template_publish_draft`).
   - Số thứ tự phiên bản nguyên dương tăng đơn điệu (`version = 1, 2, 3...`).
   - Lưu trữ bản chụp tài liệu thiết kế bất biến (`design_document`), mã băm nội dung (`version_document_hash`), ảnh thu nhỏ (`thumbnail_path`), và ảnh đa bề mặt (`surface_thumbnails`).
   - Trình kích hoạt cơ sở dữ liệu `template_versions_immutability_trigger` cấm tuyệt đối mọi thao tác `UPDATE` hoặc `DELETE` trên bảng này.

4. **Sản phẩm mục tiêu chính xác (Exact Target):**
   - Không hỗ trợ hoán đổi hoặc suy diễn mơ hồ giữa các dòng sản phẩm:
     - **Thiệp (Card):** Bắt buộc xác định chiều gập `horizontal` (ngang) hoặc `vertical` (đứng) với 3 mặt in (`front`, `inside`, `back`).
     - **Giấy gói (Wrapping Paper):** Bắt buộc xác định chế độ `pattern` (họa tiết lặp) hoặc `full-sheet` (toàn khổ).
     - **Nhãn dán (Sticker):** Bắt buộc xác định khuôn cắt `die-cut` hoặc hình học cố định `fixed-shape` (`circle`, `square`, `rectangle`, `oval`, `heart`).
     - **Bìa vở (Notebook Cover):** Khổ chuẩn A5 dọc (148 x 210 mm) với vùng an toàn gáy sổ 12% bên trái.

---

## 2. Ma trận Phân quyền & Ranh giới Bảo mật (RBAC Matrix)

Hệ thống bảo vệ toàn bộ bề mặt dữ liệu thông qua Row Level Security (RLS) mặc định đóng và dịch vụ RPC nội bộ (`SECURITY DEFINER` với `SET search_path = public`):

| Vai trò / Thao tác | Khách vãng lai (Anon) | Khách hàng đăng nhập | Biên tập viên (Editor) | Quản trị viên (Admin) |
|---|:---:|:---:|:---:|:---:|
| Duyệt danh mục mẫu đã xuất bản (`published`) | Có | Có | Có | Có |
| Tải ảnh thu nhỏ mẫu công khai | Có | Có | Có | Có |
| Nhân bản mẫu sang dự án cá nhân (`/use`) | Có (Local) | Có (Cloud) | Có | Có |
| Xem chi tiết bản nháp mẫu (`template_drafts`) | Không | Không | Có | Có |
| Chiếm quyền biên tập / Duy trì nhịp tim nháp | Không | Không | Có | Có |
| Lưu bản nháp mẫu (Autosave) | Không | Không | Có | Có |
| Tải lên ảnh nháp mẫu (`template-drafts`) | Không | Không | Có | Có |
| Chạy kiểm định in ấn (Preflight Validation Probe) | Không | Không | Có | Có |
| Xuất bản bản nháp thành phiên bản mới (`publish`) | Không | Không | Có | Có |
| Chỉnh sửa thông tin an toàn (tên, thẻ, mô tả) | Không | Không | Có | Có |
| Lưu trữ mẫu (`archive`) / Tái kích hoạt | Không | Không | Có | Có |
| Hủy bản nháp đang chỉnh sửa (`discard`) | Không | Không | Có | Có |
| Nhân bản mẫu thành mẫu mới (`duplicate`) | Không | Không | Có | Có |
| **Xóa vĩnh viễn bản mẫu chưa từng xuất bản** | **Không** | **Không** | **Không** | **Có** |
| **Bắt đầu sản xuất / Hoàn tất sản xuất đơn hàng** | **Không** | **Không** | **Không** | **Có** |
| Dọn dẹp rác tài nguyên nháp quá hạn (`cleanup`) | Không | Không | Không | Có (CLI) |

### Bảo vệ CSRF & Nguồn gọi nội bộ (Origin Assertion):
Mọi API Route quản trị (`/api/admin/content/templates/**`) đều kích hoạt hàm kiểm tra `assertTemplateOrigin(req)`:
- Kiểm tra tính hợp lệ của header `origin` hoặc `referer` khớp với `APP_URL` nội bộ.
- Ngăn chặn hoàn toàn các cuộc tấn công CSRF từ trình duyệt của bên thứ ba đối với tài khoản nhân viên đang đăng nhập.

---

## 3. Không gian Lưu trữ & Chính sách Bảo vệ Dữ liệu (Storage Architecture)

Hệ thống sử dụng hai vùng lưu trữ với ranh giới bảo mật nghiêm ngặt:

1. **Bucket riêng tư `template-drafts` (`public = false`):**
   - Lưu trữ các tệp ảnh do nhân viên tải lên trong quá trình tạo hoặc biên tập mẫu.
   - Đường dẫn lưu trữ: `drafts/{template_id}/{asset_id}.{ext}`.
   - Quyền truy cập: Chỉ nhân viên đăng nhập có vai trò Staff (`is_staff('editor')`) mới có quyền tạo Signed URL để đọc/xem trước (thời hạn tối đa 15 phút).
   - Tuyệt đối cấm khách hàng thông thường hoặc người dùng nặc danh truy cập.

2. **Bucket công khai `templates` (`public = true`):**
   - Chỉ chứa các tệp nhị phân ảnh và thumbnail của **các phiên bản đã xuất bản chính thức**.
   - Đường dẫn lưu trữ chứa mã băm nội dung bất biến:
     - Ảnh tài sản: `templates/{template_id}/{version_id}/{checksum}.{ext}`
     - Thumbnail phiên bản: `thumbnails/{template_id}/{version_id}.png`
     - Thumbnail từng mặt: `thumbnails/{template_id}/{version_id}-{surface}.png`
   - Cache Header: Thiết lập `Cache-Control: public, max-age=31536000, immutable`.
   - Quyền ghi: Chỉ tài khoản hệ thống đặc quyền (`service_role`) thông qua RPC xuất bản mới có quyền sao chép file từ `template-drafts` sang `templates`.

3. **Nguyên tắc bảo vệ dữ liệu khách hàng (Customer Asset Privacy):**
   - Khi nhân viên chọn tính năng *"Tạo mẫu từ dự án"* (`createTemplateFromProject`):
     - Hệ thống sao chép tệp nhị phân từ dự án nguồn sang không gian `template-drafts` với mã định danh tài sản hoàn toàn mới.
     - Viết lại đường dẫn tham chiếu trong tài liệu thiết kế.
     - Tuyệt đối không trỏ trực tiếp hay làm lộ URL bucket cá nhân của khách hàng.
     - Nghiêm cấm tạo mẫu từ các dự án gắn liền với Đơn hàng (`order_id`) để bảo vệ dữ liệu sản xuất thương mại.

---

## 4. Biên tập Mẫu: Khóa Thành phần, Vùng giữ chỗ & Sandbox Xem trước

### A. Khóa thành phần khách hàng (`customerLocked`):
- Nhân viên tác giả có thể khóa bất kỳ thành phần nào trên canvas bằng nút chuyển đổi **"Khóa khách sửa"** (`customerLocked: true`).
- Hiệu lực trong chế độ Khách hàng (`customer` / `guest`):
  - Chặn hoàn toàn việc chọn (selection), di chuyển, kéo dãn, xoay thành phần.
  - Chặn xóa, sao chép, nhóm gộp (`group`), hoặc thay đổi thứ tự lớp (`reorder`).
  - Chặn thao tác qua phím tắt (Delete, Backspace, Ctrl+Z, Ctrl+Y).
- Hiệu lực trong chế độ Nhân viên duyệt đơn (`staff-edit`):
  - Nhân viên được phép điều chỉnh vị trí hoặc sửa lỗi chính tả để phục vụ in ấn, nhưng cờ `customerLocked: true` vẫn được giữ nguyên vẹn trên thành phần.

### B. Vùng giữ chỗ linh hoạt (Placeholders):
Hệ thống hỗ trợ 2 loại vùng giữ chỗ với nhãn tiếng Việt trực quan:
1. **Giữ chỗ Văn bản (`placeholderType: 'text'`):**
   - Hiển thị gợi ý nội dung (ví dụ: *"Nhập tên bé"*, *"Lời chúc sinh nhật"*).
   - Khi khách hàng chạm vào thành phần, giao diện mở ngay hộp thoại nhập văn bản. Khi khách nhập chữ, cờ giữ chỗ tự động được gỡ bỏ.
2. **Giữ chỗ Hình ảnh (`placeholderType: 'image'`):**
   - Hiển thị khung viền nét đứt kèm nút gợi ý *"Chọn ảnh thay thế"*.
   - Khách hàng tải ảnh lên sẽ thay thế trực tiếp vào đúng vị trí, tỷ lệ và mặt nạ (mask) đã định trước.
3. **An toàn in ấn tuyệt đối (Print-Safety):**
   - Nếu khách hàng để trống vùng giữ chỗ và tiến hành đặt in:
     - Hệ thống tự động **loại bỏ hoàn toàn vùng giữ chỗ** khỏi tệp render sản xuất vật lý và ảnh thu nhỏ.
     - Tuyệt đối không in các dòng chữ mẫu hoặc khung nét đứt lên sản phẩm thực tế của khách hàng.

### C. Môi trường thử nghiệm cách ly (Customer Preview Sandbox):
- Nút **"Xem như khách"** trên thanh công cụ biên tập mở một modal toàn màn hình mô phỏng chính xác 100% trải nghiệm của khách hàng.
- **Tính cách ly hoàn toàn:**
  - Chạy trên bản sao bộ nhớ tạm thời của tài liệu thiết kế hiện tại.
  - Vô hiệu hóa tính năng lưu trữ cục bộ (`localStorage`) và lưu tự động lên đám mây.
  - Nút *"Tiếp tục đặt in"* bị vô hiệu hóa (`capabilities.canCheckout = false`).
  - Đóng hộp thoại lập tức hoàn trả nhân viên về trạng thái biên tập của tác giả mà không gây mất mát dữ liệu.

---

## 5. Quy trình Xuất bản Nguyên tử (Atomic Publishing Pipeline)

Quá trình xuất bản được thực hiện qua giao dịch cơ sở dữ liệu duy nhất (`template_publish_draft`) với biên nhận kiểm định in ấn thực tế:

```
[Nhân viên nhấn Xuất bản]
       │
       ▼
 1. Kiểm định in ấn (Validation Probe) ──► Chạy headless Chromium chụp proof hash
       │                                  Tạo ValidationReceipt có thời hạn 10 phút
       ▼
 2. Bắt đầu giao dịch SQL nguyên tử:
    ├─ Khóa dòng mẫu (SELECT FOR UPDATE) kiểm tra revision CAS & idempotency key
    ├─ Khóa và kiểm tra trạng thái tất cả Font & Sticker phụ thuộc (phải là 'published')
    ├─ Kiểm tra tính tương thích của sản phẩm mục tiêu (Product, Variant, Mode, Shape)
    ├─ Sao chép toàn bộ ảnh nháp sang bucket công khai 'templates'
    ├─ Chèn bản ghi bất biến vào template_versions
    ├─ Ghi nhận danh mục phụ thuộc vào template_version_dependencies
    ├─ Ghi nhận danh mục tài sản vào template_version_assets
    ├─ Cập nhật con trỏ current_published_version_id trên templates
    ├─ Xóa bản nháp làm việc trong template_drafts
    └─ Ghi log kiểm toán vào template_operations
       │
       ▼
[Giao dịch Hoàn tất thành công (COMMIT)]
```

### Yêu cầu Biên nhận Kiểm định (Validation Receipt):
- Biên nhận do dịch vụ `TemplateValidationService` cấp sau khi Chromium kiểm định tài liệu thiết kế.
- Chứa: `receiptId`, `templateId`, `draftRevision`, `documentHash`, `engineFingerprint`, và chữ ký điện tử HMAC-SHA256.
- **Thời hạn TTL: 10 phút.** Nếu vượt quá 10 phút mà nhân viên chưa xác nhận xuất bản, hệ thống sẽ từ chối bằng lỗi `STALE_RECEIPT` và yêu cầu kiểm định lại.

### Nguyên tắc Bất biến Lịch sử (Historical Immutability & No Propagation):
- Việc xuất bản phiên bản mới (`v2`, `v3`) **tuyệt đối không làm thay đổi các dự án hoặc đơn hàng cũ** đã tạo từ phiên bản `v1`.
- Các dự án của khách hàng lưu giữ độc lập bản chụp thiết kế (`working_document`), đảm bảo tính nhất quán của lịch sử sản xuất.

---

## 6. Quy trình Vận hành Dành cho Nhân viên Quản trị

### A. Tạo mới mẫu thiết kế:
1. Mở trang quản lý danh mục: `/admin/content/templates`.
2. Nhấn nút **"Tạo mẫu mới"** để mở hộp thoại cấu hình:
   - Nhập **Tên mẫu** (tối thiểu 2 ký tự) và đường dẫn tĩnh (**Slug**).
   - Chọn **Dòng sản phẩm**: Giấy gói (`wrapping`), Thiệp (`card`), Nhãn dán (`sticker`), hoặc Bìa sổ (`notebook`).
   - Chọn **Kiểu dáng / Biến thể mục tiêu** (ví dụ: Thiệp ngang, Giấy gói lặp họa tiết, Nhãn dán hình tròn).
   - Chọn **Danh mục** và nhập các **Thẻ tìm kiếm** (cách nhau bởi dấu phẩy).
3. Nhấn **"Khởi tạo mẫu"** -> Hệ thống chuyển hướng thẳng vào công cụ biên tập chuyên dụng của tác giả (`/admin/content/templates/[id]/edit`).

### B. Thiết kế và Khóa nội dung trong Editor:
1. Chỉnh sửa chữ, phối màu, chèn nhãn dán từ thư viện nội dung chuẩn State 42.
2. Thiết lập quyền chỉnh sửa của khách hàng:
   - Chọn đối tượng -> Bật **"Khóa khách sửa"** nếu muốn bảo vệ bố cục hoặc hình minh họa thương hiệu.
   - Đối với văn bản hoặc hình ảnh linh hoạt: Bật **"Đặt làm vùng giữ chỗ"** và điền nội dung hướng dẫn khách hàng.
3. Nhấn **"Xem như khách"** trên thanh tiêu đề để kiểm tra thực tế trải nghiệm thao tác của khách hàng.
4. Nhấn **"Kiểm tra in ấn"** để hệ thống chạy tiền kiểm Preflight và tạo biên nhận kiểm định.

### C. Xuất bản và Quản lý Vòng đời:
1. Trong thanh tác vụ bên phải hoặc menu xuất bản:
   - Nhấn **"Xuất bản phiên bản"**.
   - Nếu có cảnh báo không có thành phần sửa được (`NO_EDITABLE_ELEMENTS`), đánh dấu xác nhận đồng ý để tiếp tục.
   - Hệ thống tự động đẩy phiên bản mới lên danh mục khách hàng trong vòng chưa đầy 1 giây.
2. Các thao tác vòng đời bổ sung trên trang chi tiết `/admin/content/templates/[id]`:
   - **Lưu trữ (Archive):** Ngừng cung cấp mẫu cho khách hàng mới (yêu cầu lý do 3–500 ký tự). Các khách hàng cũ đã lưu dự án hoặc đơn hàng vẫn mở và in ấn bình thường.
   - **Tái kích hoạt (Republish):** Đưa mẫu đã lưu trữ trở lại hoạt động nếu tất cả tài nguyên phụ thuộc còn nguyên vẹn.
   - **Nhân bản (Duplicate):** Tạo một bản sao độc lập của mẫu kèm theo toàn bộ tài sản ảnh nháp mới để phát triển chủ đề khác.
   - **Xóa vĩnh viễn (Delete):** Chỉ khả dụng cho Quản trị viên (Admin) đối với các mẫu **chưa từng được xuất bản lần nào**.

---

## 7. Lệnh Vận hành & Công cụ Dòng lệnh (CLI)

```sh
# 1. Chạy bộ kiểm thử tự động toàn diện State 43 (9 kịch bản E2E + 9 bằng chứng thị giác)
node --experimental-strip-types scripts/state43-template-smoke.ts --scenario all --base-url http://localhost:3000 --artifacts-dir .superpowers/state43-evidence

# 2. Quét kiểm kê các mẫu legacy cần chuyển đổi (Inventory không cần DB)
node --experimental-strip-types scripts/state43-template-migrate.ts --inventory

# 3. Kiểm tra tính toàn vẹn của danh mục mẫu đã chuyển đổi (Verify)
# Chế độ live (yêu cầu NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SECRET_KEY, thoát mã lỗi 1 nếu thiếu thông tin xác thực DB): đối chiếu bảng template_legacy_targets, templates, template_versions
# (Để kiểm kê hoặc xem manifest offline không cần DB, sử dụng lệnh --inventory hoặc --manifest)
node --experimental-strip-types scripts/state43-template-migrate.ts --verify
# 4. Quét và dọn dẹp các tài nguyên ảnh nháp mồ côi quá 24h
node --experimental-strip-types scripts/state43-template-cleanup.ts --dry-run
node --experimental-strip-types scripts/state43-template-cleanup.ts --apply

# 5. Chạy bộ kiểm tra tĩnh TypeScript và kiểm thử mã nguồn dự án
pnpm run typecheck
pnpm test
pnpm run build
```

---

## 8. Hướng dẫn Xử lý Sự cố & Khôi phục Lỗi (Troubleshooting & Recovery)

### Kịch bản 1: Lỗi sao chép Storage trong quá trình xuất bản (`STORAGE_COPY_FAILED`)
- **Hiện tượng:** Giao dịch xuất bản bị hủy bỏ, thông báo lỗi sao chép nhị phân từ `template-drafts` sang `templates`.
- **Nguyên nhân:** Mạng gián đoạn hoặc tệp ảnh nháp trong bucket riêng tư bị xóa thủ công ngoài ý muốn.
- **Xử lý:**
  - Giao dịch SQL tự động Rollback hoàn toàn: Bản nháp và con trỏ mẫu cũ được bảo toàn 100%.
  - Nhân viên chỉ cần mở lại Editor, kiểm tra lại các đối tượng ảnh, và nhấn Xuất bản lại.

### Kịch bản 2: Biên nhận kiểm định hết hạn (`STALE_RECEIPT` hoặc `INVALID_RECEIPT`)
- **Hiện tượng:** Nhấn xuất bản nhận thông báo lỗi mã 400 kèm thông điệp *"Biên nhận kiểm định đã hết hạn hoặc không hợp lệ"*.
- **Nguyên nhân:** Quá 10 phút kể từ lúc chạy kiểm định in ấn Chromium đến lúc nhấn nút xác nhận xuất bản.
- **Xử lý:** Nhấn lại nút **"Kiểm tra in ấn"** để Chromium quét lại tài liệu và cấp biên nhận mới (mất ~1–2 giây), sau đó nhấn Xuất bản ngay.

### Kịch bản 3: Xung đột phiên làm việc và hết hạn thời gian giữ chỗ (`DRAFT_LEASE_EXPIRED`)
- **Hiện tượng:** Nhân viên nhận cảnh báo *"Phiên chỉnh sửa đã hết hạn hoặc bị chiếm quyền bởi nhân viên khác"*.
- **Nguyên nhân:** Nhân viên mở tab biên tập nhưng không thao tác trong hơn 120 giây và mất kết nối mạng (heartbeat thất bại), hoặc một nhân viên khác nhấn *"Chiếm quyền biên tập"*.
- **Xử lý:**
  - Hệ thống tự động chuyển editor sang chế độ chỉ đọc để tránh ghi đè dữ liệu.
  - Nhấn nút **"Tiếp tục biên tập"** để hệ thống lấy Lease mới và nạp bản chụp mới nhất từ máy chủ.

### Kịch bản 4: Mẫu bị khóa sử dụng do tài nguyên phụ thuộc bị lưu trữ (`ARCHIVED_DEPENDENCY`)
- **Hiện tượng:** Khách hàng hoặc nhân viên nhấn chọn mẫu nhận lỗi mã 409 `TEMPLATE_UNAVAILABLE`.
- **Nguyên nhân:** Một phông chữ hoặc nhãn dán được sử dụng trong mẫu đã bị nhân viên thư viện State 42 đưa vào trạng thái `archived`.
- **Xử lý:**
  - Nhân viên mở trang chi tiết mẫu `/admin/content/templates/[id]`.
  - Mục *"Tình trạng tài nguyên phụ thuộc"* sẽ hiển thị chính xác tên và ID của nhãn dán hoặc phông chữ bị khóa.
  - Nhấn **"Chỉnh sửa bản nháp"** -> Thay thế nhãn dán/phông chữ đó bằng tài nguyên mới đạt chuẩn -> Xuất bản phiên bản tiếp theo (`v+1`). Mẫu sẽ lập tức khả dụng trở lại cho khách hàng mới.

### Kịch bản 5: Chuyển đổi dữ liệu cũ thiếu bản quyền nhị phân (`MIGRATION_MISSING_BYTES`)
- **Hiện tượng:** Chạy lệnh `state43-template-migrate.ts --verify` báo lỗi thiếu file nhị phân ổn định cho các mẫu cũ.
- **Xử lý:**
  - Tuyệt đối không xóa bỏ hay tạo dữ liệu giả mạo làm hỏng thiết kế lịch sử của khách hàng.
  - Bổ sung file SVG/Font gốc có bản quyền vào thư viện State 42, chạy `state42-library-migrate.ts`, sau đó chạy lại lệnh kiểm tra State 43.

---

## 9. Bảng Đối chiếu Nghiệm thu Hoàn thành (Definition of Done - 30 Rows)

Bảng đối chiếu toàn bộ 30 tiêu chí nghiệm thu của State 43 cùng bằng chứng xác thực thực tế:

| # | Tiêu chí Nghiệm thu | Task phụ trách | Bằng chứng Xác thực (Test File / CLI / Artifact) | Trạng thái |
|---|---|---|---|:---:|
| 1 | Quản trị nhân viên an toàn (RBAC Matrix) | T04, T14 | `src/test/template-authorization.test.ts` (Từ chối truy cập 401/403 trên các vai trò Anon, Editor, Admin) | ĐẠT |
| 2 | Khởi tạo bản nháp mục tiêu chính xác | T02, T05 | `src/test/template-domain.test.ts`, `src/test/template-management.test.ts` (Từ chối cấu hình sai mode/shape) | ĐẠT |
| 3 | Sao chép mẫu từ thiết kế hợp lệ | T10, T14 | `src/test/template-assets.test.ts` (Chặn sao chép từ đơn hàng, tách biệt quyền sở hữu ảnh) | ĐẠT |
| 4 | Tái sử dụng CustomizerShell editor | T09 | `src/test/template-preview-isolation.test.ts`, `.superpowers/state43-evidence/admin-desktop-1440x1000.png` | ĐẠT |
| 5 | Khóa thành phần khách hàng (`customerLocked`) | T07 | `src/test/template-locks.test.ts` (24 ca kiểm thử chặn thao tác chuột, kéo thả, phím tắt và lịch sử) | ĐẠT |
| 6 | Vùng giữ chỗ linh hoạt Văn bản & Hình ảnh | T08 | `src/test/template-placeholders.test.ts` (Kiểm thử kích hoạt, tự động gỡ bỏ khi nhập, bỏ qua khi in) | ĐẠT |
| 7 | Sandbox xem trước cách ly chính xác | T09, T11 | `src/test/template-preview-isolation.test.ts` (Chặn lưu LocalStorage, chặn đặt in từ Customer Preview) | ĐẠT |
| 8 | Lưu tự động bản nháp lên Supabase | T06 | `src/test/template-draft-concurrency.test.ts` (Lưu ngữ nghĩa debounced, khôi phục trạng thái hoàn chỉnh) | ĐẠT |
| 9 | Chống ghi đè xung đột (CAS & Lease) | T06 | `src/test/template-draft-concurrency.test.ts` (Kiểm thử 2 phiên, stale revision, takeover tăng epoch) | ĐẠT |
| 10 | Kiểm định in ấn chuẩn mực (Preflight) | T11 | `src/test/template-validation.test.ts` (Phát hiện lỗi khóa và cảnh báo thiếu thành phần biên tập) | ĐẠT |
| 11 | Xác thực tính sẵn sàng của phụ thuộc | T11, T12 | `src/test/template-validation.test.ts` (Khóa phụ thuộc phông, sticker, kiểm tra mã băm toàn vẹn) | ĐẠT |
| 12 | Xác thực sản phẩm mục tiêu chính xác | T02, T11 | `src/test/template-domain.test.ts` (Chặn sai lệch Mode giấy gói, Shape nhãn dán, Mặt thiệp) | ĐẠT |
| 13 | Phiên bản mẫu bất biến tuyệt đối | T03, T12 | `supabase/tests/state43_template_management.sql` (Kích hoạt IMMUTABLE_TEMPLATE_VERSION chặn sửa/xóa) | ĐẠT |
| 14 | Con trỏ phiên bản nguyên tử (Atomic Pointer) | T12 | `src/test/template-publish.test.ts` (Xử lý tương tranh, chống phát hành trùng lặp request_id) | ĐẠT |
| 15 | Sửa mẫu đã xuất bản tạo bản nháp mới | T05, T12 | `src/test/template-lifecycle.test.ts` (Khách vẫn dùng phiên bản cũ trong khi nhân viên sửa bản nháp) | ĐẠT |
| 16 | Phiên bản mới không ảnh hưởng dự án cũ | T17, T19 | `src/test/template-project-isolation.test.ts` (`before.hash == after.hash`, dự án cũ không bị đột biến) | ĐẠT |
| 17 | Duyệt danh mục mẫu tương thích sẵn sàng | T15 | `src/test/template-catalog.test.ts` (Phân trang Keyset SQL, lọc bỏ mẫu có tài nguyên phụ thuộc bị lỗi) | ĐẠT |
| 18 | Nhân bản độc lập cho khách vãng lai | T16 | `src/test/template-guest-clone.test.ts`, `.superpowers/state43-evidence/guest-template-clone-editor.png` | ĐẠT |
| 19 | Nhân bản độc lập cho tài khoản đám mây | T17 | `src/test/template-cloud-clone.test.ts`, `.superpowers/state43-evidence/account-template-project.png` | ĐẠT |
| 20 | Lưu giữ nguồn gốc mẫu không phụ thuộc | T16–19 | `src/test/template-production.test.ts` (Lưu giữ source_template_id và version trên design_versions) | ĐẠT |
| 21 | Lưu trữ mẫu bảo toàn thiết kế lịch sử | T13, T19 | `src/test/template-project-isolation.test.ts` (Ẩn mẫu khỏi danh mục mới, dự án cũ vẫn render tốt) | ĐẠT |
| 22 | Tài nguyên thư viện bị lưu trữ chỉ chặn dùng mới | T11, T19 | `src/test/template-project-isolation.test.ts` (Dùng mới trả về 409, đơn hàng lịch sử hoàn tất 100%) | ĐẠT |
| 23 | Khắc phục phụ thuộc khôi phục khả dụng | T13, T19 | `src/test/template-project-isolation.test.ts` (Xuất bản bản vá v3 khôi phục mẫu ngay lập tức) | ĐẠT |
| 24 | Ảnh thu nhỏ phiên bản bất biến | T10, T12, T19 | `src/test/template-project-isolation.test.ts` (Mã băm file ảnh thu nhỏ của v1 không đổi sau khi ra mắt v2) | ĐẠT |
| 25 | Bảo vệ quyền riêng tư tài sản khách hàng | T10, T11 | `src/test/template-assets.test.ts` (Tách biệt bucket, cấm lộ URL khách hàng vào thư viện mẫu) | ĐẠT |
| 26 | Bảo vệ toàn diện qua phân quyền RLS/RPC | T04, T19 | `src/test/template-authorization.test.ts`, `supabase/tests/state43_template_management.sql` | ĐẠT |
| 27 | Truy xuất phiên bản lịch sử an toàn | T15, T19 | `src/test/template-catalog.test.ts` (Chỉ chủ sở hữu dự án hoặc nhân viên mới đọc được phiên bản cũ) | ĐẠT |
| 28 | Chuyển đổi mã định danh & URL cũ tương thích | T01, T18 | `src/test/template-migration.test.ts` (Ánh xạ 45 mục tiêu chính xác từ 18 mẫu legacy, giữ nguyên URL) | ĐẠT |
| 29 | Toàn bộ kiểm thử hệ thống vượt qua | T20 | `pnpm test` (1018 bài kiểm thử vượt qua 100%, 0 lỗi) | ĐẠT |
| 30 | Bản dựng sản xuất (Build) hoàn tất thành công | T20 | `pnpm run build` (Next.js 16 App Router build thành công 32 tĩnh/động) | ĐẠT |
