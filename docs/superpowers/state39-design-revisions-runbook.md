# State 39: Admin Design Review & Edit Runbook

Tài liệu vận hành và kiểm tra hệ thống soát lỗi, chỉnh sửa thiết kế và phê duyệt bản in sản xuất bất biến (State 39).

---

## 1. Kiến trúc cốt lõi

### Hai con trỏ phiên bản (Version Pointers)
- `orders.customer_approved_design_version_id`: Phiên bản gốc khách hàng đã duyệt tại Checkout (luôn là v1). Bất biến, trigger database cấm UPDATE hoặc DELETE.
- `orders.production_design_version_id`: Phiên bản đang được duyệt để sản xuất (mặc định = v1 khi tạo đơn; khi nhân viên duyệt bản sửa, con trỏ này trỏ sang v2, v3...).

### Bảng nháp chỉnh sửa đơn nhất (Single Active Draft)
- Bảng `design_revision_drafts`: Lưu nội dung thiết kế đang sửa.
- Partial unique index: Mỗi đơn hàng chỉ có tối đa **1 bản nháp đang hoạt động** (`status in ('editing', 'ready_for_review')`).
- Phiên bản tài liệu (`revision`): Bắt đầu từ 1, tăng dần theo cơ chế Compare-And-Swap (CAS) mỗi lần lưu hợp lệ.
- Quyền giữ phiên (`lease`): Thời hạn 120 giây, heartbeat gửi mỗi 30 giây khi tab hiển thị. Khi hết hạn, Admin có thể tiếp quản (`takeover`).

### Phê duyệt bản in nguyên tử
- RPC `approve_design_revision`: Khóa Order + Draft + Project, kiểm tra assessment kiểm tra trước in (Preflight), cấp phát số phiên bản `version_number`, chèn bản ghi bất biến vào `design_versions`, cập nhật `production_design_version_id`, ghi nhận sự kiện `design_revision_approved`, và đẩy tác vụ render thumbnail vào `design_render_jobs`.
- RPC `approve_customer_design_as_production`: Duyệt file khách làm bản in mà không tạo thêm phiên bản v2 dư thừa.

---

## 2. Triển khai Migration Cơ sở dữ liệu

Thứ tự thực thi SQL trên VPS Supabase:

```sh
# 1. Chạy migration 0004
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_state39_design_revisions.sql

# 2. Chạy bộ kiểm thử tự động DB invariants
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state39_design_revisions.sql

# 3. (Tùy chọn trên môi trường dev/staging) Nạp dữ liệu mẫu
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_state39.sql
```

---

## 3. Các lệnh kiểm tra và công cụ vận hành

### A. Kiểm tra toàn bộ Unit Test & Typecheck
```sh
pnpm typecheck
pnpm test
pnpm build
```

### B. Worker Render Thumbnail Outbox
Tác vụ render thumbnail chạy nền hoặc qua cron job:
```sh
# Chạy quét 1 lần và thoát
node --experimental-strip-types scripts/state39-render-jobs.ts --once
```

### C. Thu dọn tài nguyên nháp quá hạn (Asset Garbage Collection)
Thu dọn các ảnh/tài nguyên tải lên trong bản nháp đã bị hủy sau 7 ngày:
```sh
# Chạy kiểm tra trước (mặc định dry-run, an toàn không xóa thật)
node --experimental-strip-types scripts/state39-asset-gc.ts --dry-run

# Thực hiện xóa thật trên môi trường được cấp quyền
node --experimental-strip-types scripts/state39-asset-gc.ts --delete
```

### D. Kiểm tra đồng thời (Concurrency Smoke Test)
Kiểm tra chống race condition giữa hai phiên làm việc:
```sh
node --experimental-strip-types scripts/state39-concurrency-smoke.ts
```

---

## 4. Kịch bản kiểm thử giao diện thủ công (QA Matrix)

1. **Khách duyệt v1 -> Duyệt không cần sửa**:
   - Mở `/admin/orders/[id]/design` của đơn hàng mới.
   - Nhấn "Duyệt không cần sửa" -> Trạng thái chuyển sang `approved`, con trỏ sản xuất vẫn giữ nguyên v1.
2. **Tạo bản chỉnh sửa**:
   - Nhấn "Tạo bản chỉnh sửa" -> Nhập lý do (3-500 ký tự).
   - Editor mở với đầy đủ công cụ vẽ, chọn layer, chỉnh chữ, đổi màu, đổi viền sticker.
   - Các thuộc tính thương mại (Sản phẩm, Khổ in, Số lượng) được khóa hoàn toàn.
3. **Autosave & Khôi phục phiên**:
   - Chỉnh sửa và quan sát góc trên chuyển từ "Đang lưu..." -> "Đã lưu máy chủ".
   - Tải lại trang (F5): Bản nháp được tải lại nguyên vẹn với phiên bản tài liệu mới nhất.
4. **Tiền kiểm & So sánh**:
   - Nhấn "Xem lại" -> Chuyển sang màn hình So sánh bản sửa (Mobile: tab chuyển; Desktop: chia đôi 2 cột).
   - Chọn mặt thiệp (trước / trong / sau) -> Cả hai bản hiển thị đồng bộ.
   - Xác nhận các cảnh báo in ấn (nếu có) -> Nhấn "Duyệt bản sửa" -> Tạo v2 thành công và quay về trang chi tiết đơn.
