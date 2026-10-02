# State 42: Admin Asset Library (Fonts + Stickers) Runbook

Tài liệu vận hành, phân quyền, cấu hình bảo mật và kiểm thử cho Thư viện nội dung quản trị (State 42).

---

## 1. Tổng quan Kiến trúc & Vòng đời Tài nguyên

Hệ thống quản lý tài nguyên thiết kế (Sticker và Phông chữ) hoạt động theo mô hình **Draft-first**, tách biệt không gian lưu trữ riêng tư trước khi xuất bản ra thư viện khách hàng:

```
[Nhân viên tải lên]
       │
       ▼
   ┌─────────┐     (Kiểm tra cú pháp & an toàn SVG / fontkit)
   │  Draft  │ ──► [Lưu tạm trong bucket riêng tư: library-drafts]
   └─────────┘
       │
       ├─► [Kiểm định in ấn: Chromium Playwright render probe]
       │   └─ Tạo ValidationReceipt gắn liền với revision hiện tại
       │
       ├─► [Xuất bản (Publish): Kiểm tra bản quyền, receipt đạt tiêu chuẩn]
       │   └─ Sao chép nhị phân sang bucket công khai bất biến: fonts / sticker-library
       ▼
 ┌───────────┐
 │ Published │ ──► [Hiển thị cho khách hàng chọn khi tạo thiết kế mới]
 └───────────┘
       │
       ├─► [Lưu trữ (Archive): Yêu cầu lý do 3–500 ký tự]
       ▼
 ┌───────────┐
 │ Archived  │ ──► [Ẩn khỏi danh mục chọn mới, BẢO TỒN NGUYÊN VẸN các thiết kế cũ đã dùng]
 └───────────┘
```

### Các trạng thái chuẩn (Canonical Lifecycle):
1. **`draft` (Bản nháp):**
   - Chỉ nhân viên (Editor/Admin) có thể xem và thử nghiệm.
   - File nhị phân lưu trong bucket riêng tư `library-drafts`.
   - Có thể thay thế file nhị phân (binary replacement) trước lần đầu xuất bản.
   - Chưa được phép xuất hiện trong danh mục khách hàng.
2. **`published` (Đã xuất bản):**
   - File nhị phân chuyển sang bucket công khai `fonts` hoặc `sticker-library` với checksum bất biến.
   - Khách hàng có thể tìm kiếm và chèn vào thiết kế.
   - **Bất biến tuyệt đối:** Không cho phép ghi đè hay thay thế file nhị phân đã xuất bản dưới cùng ID.
   - Chỉ cho phép sửa đổi thông tin an toàn: tên hiển thị, thể loại, thẻ, mô tả.
3. **`archived` (Lưu trữ):**
   - Ẩn khỏi bộ chọn của khách hàng mới.
   - **Bảo toàn thiết kế lịch sử:** Mọi đơn hàng, dự án hoặc phiên bản thiết kế cũ đã sử dụng phông/sticker này vẫn giải quyết được file nhị phân gốc qua mã băm và mã định danh bất biến.
   - Không thể đưa ngược về trạng thái `draft`.

---

## 2. Ma trận Phân quyền (RBAC Matrix)

| Vai trò / Thao tác | Khách / Anon | Biên tập viên (Editor) | Quản trị viên (Admin) |
|---|:---:|:---:|:---:|
| Xem danh mục đã xuất bản (`published`) | Có | Có | Có |
| Tải file nhị phân đã xuất bản/lưu trữ theo ID | Có | Có | Có |
| Xem danh sách bản nháp (`draft`) | Không | Có | Có |
| Tải lên sticker / phông chữ nháp | Không | Có | Có |
| Chỉnh sửa thông tin an toàn (tên, thẻ, mô tả) | Không | Có | Có |
| Chạy kiểm định in ấn (Validation Probe) | Không | Có | Có |
| Xuất bản sticker / phông chữ (`publish`) | Không | Có | Có |
| Lưu trữ sticker / phông chữ (`archive`) | Không | Có | Có |
| **Xóa vĩnh viễn bản nháp chưa từng xuất bản** | **Không** | **Không** | **Có** |
| Thao tác sản xuất đơn hàng / Duyệt file in | Không | Không | Có (riêng biệt) |

---

## 3. Không gian Lưu trữ & Chính sách Bảo mật (Storage Policies)

- **`library-drafts` (Riêng tư - `public = false`):**
  - Chứa các file nháp đang tải lên hoặc đang kiểm tra.
  - RLS: Chỉ nhân viên đăng nhập (`is_staff()`) mới có quyền đọc. Chặn hoàn toàn truy cập nặc danh hoặc khách hàng thông thường.
- **`fonts` & `sticker-library` (Công khai - `public = true`):**
  - Chỉ chứa các tài nguyên đã vượt qua kiểm định và được lệnh `publish` sao chép sang.
  - Đường dẫn lưu trữ chứa mã SHA-256 bất biến:
    - Phông: `fonts/{family_id}/{face_id}/{checksum}.{ext}`
    - Sticker: `stickers/{sticker_id}/{checksum}.{ext}`
  - RLS: Mọi người có thể đọc; chỉ hệ thống (`service_role`) mới có quyền ghi/sao chép khi xuất bản.

---

## 4. Tiêu chuẩn Kiểm định An toàn (Validation Standards)

### A. Sticker (Vector & Raster):
1. **SVG:**
   - Phân tích cú pháp qua XML DOM Parser có cơ chế bắt lỗi nghiêm ngặt (`@xmldom/xmldom`).
   - Cấm hoàn toàn: `DOCTYPE`, thực thể ngoài, thẻ `<script>`, `<foreignObject>`, `<animate>`, `<image>`, thẻ văn bản `<text>`/`<tspan>`.
   - Cấm toàn bộ thuộc tính sự kiện inline (`onload`, `onclick`...) và URL ngoài (`http://`, `https://`, `javascript:`).
   - Tự động phát hiện và từ chối tham chiếu vòng lặp nội bộ (`#id` cycle).
   - Tự động sinh ảnh thu nhỏ (thumbnail) PNG 320px giữ kênh trong suốt bằng `sharp`.
2. **Ảnh Raster (PNG, JPEG, WebP):**
   - Giải mã và kiểm tra kích thước tối đa (không vượt quá 40 megapixel hoặc 8192px).
   - Chuẩn hóa hướng xoay theo EXIF.
   - Loại trừ ảnh động (animation).

### B. Kiểu chữ (Fonts):
1. **Phân tích nhị phân bằng `fontkit`:**
   - Hỗ trợ các định dạng TTF, OTF, WOFF, WOFF2 (tối đa 10 MiB).
   - Trích xuất: Tên PostScript, họ nội bộ, dải độ đậm (weight), kiểu dáng (normal/italic), đơn vị em, số lượng glyph.
   - Kiểm tra cờ bản quyền nhúng (OS/2 `fsType` 0x0002).
2. **Kiểm tra độ phủ tiếng Việt (Vietnamese Glyphs):**
   - Quét toàn bộ 148 ký tự tiếng Việt chuẩn (chữ hoa, chữ thường và dấu thanh).
   - Ghi nhận danh sách ký tự còn thiếu vào `missingCodepoints`.
3. **Thử nghiệm render Chromium Playwright:**
   - Nạp phông qua `@font-face` với `font-synthesis: none`.
   - Chụp ảnh bằng chứng render (proof hash) và ghi nhận chữ ký công cụ in ấn (`engineFingerprint`).

---

## 5. Quy trình Vận hành Dành cho Nhân viên

1. **Quản lý Sticker:**
   - Mở giao diện: `/admin/content/stickers`.
   - Nhấn **"Tải lên sticker"** -> chọn 1 hoặc nhiều tệp (tối đa 50 tệp) -> hệ thống tự động kiểm tra an toàn và nạp vào Bản nháp.
   - Nhấn vào sticker bất kỳ để mở hộp thoại chi tiết:
     - Xem ảnh xem trước nháp.
     - Chỉnh sửa tên hiển thị, danh mục, thẻ tìm kiếm.
     - Nhấn **"Kiểm định in"** để kiểm tra tính tương thích.
     - Nhấn **"Xuất bản"** khi sticker đã đạt yêu cầu để đưa vào thư viện cho khách dùng.
     - Nhấn **"Lưu trữ"** (nhập lý do từ 3–500 ký tự) nếu muốn ngừng cung cấp cho khách mới.
     - Quản trị viên (Admin) có thể nhấn **"Xóa nháp"** với các sticker nháp chưa từng xuất bản.

2. **Quản lý Phông chữ:**
   - Mở giao diện: `/admin/content/fonts`.
   - Nhấn **"Thêm họ phông chữ"** để tạo nhóm mới (ví dụ: *Be Vietnam Pro*).
   - Nhấn **"Chi tiết & tệp"** để vào trang biến thể phông (`/admin/content/fonts/[id]`).
   - Nhấn **"Thêm kiểu (Face)"** -> Chọn tệp phông nhị phân (.ttf/.woff2) -> Xác nhận nhúng web và in ấn thương mại.
   - Kiểm tra kết quả phân tích ký tự tiếng Việt.
   - Nhấn **"Xuất bản"** cho biến thể đạt chuẩn.
   - Khi có ít nhất 1 biến thể đã xuất bản, có thể xuất bản toàn bộ Họ phông chữ ra bộ chọn của khách.

---

## 6. Lệnh Vận hành & Công cụ CLI

```sh
# 1. Chạy bộ kiểm tra tự động State 42 (Kiểm định font, sticker và render Chromium)
node --experimental-strip-types scripts/state42-library-smoke.ts

# 2. Quét kiểm tra dữ liệu cần chuyển đổi (Dry-run không ghi DB)
node --experimental-strip-types scripts/state42-library-migrate.ts --dry-run

# 3. Dọn dẹp các tệp nháp hết hạn hoặc lỗi tải lên
node --experimental-strip-types scripts/state42-library-cleanup.ts --dry-run
node --experimental-strip-types scripts/state42-library-cleanup.ts --apply

# 4. Chạy toàn bộ kiểm thử TypeScript & Jest/Node Runner
pnpm run typecheck
pnpm test
pnpm build
```
