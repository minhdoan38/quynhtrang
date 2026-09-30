# State 40: Admin Order Fulfillment & Production Lifecycle Runbook

Tài liệu vận hành và kiểm thử quy trình sản xuất, hoàn tất đơn hàng và hủy đơn có kiểm toán (State 40).

---

## 1. Vòng đời Xử lý & Sản xuất (Fulfillment Lifecycle)

```
[Khách tạo đơn]
       │
       ▼
   unprocessed (Chờ thanh toán / Chờ duyệt file)
       │
       ├─ [Khách đã thanh toán + Thiết kế đã duyệt]
       ▼
 ready_for_production (Sẵn sàng sản xuất)
       │
       ├─ [RPC start_order_production: Kiểm tra không Tạm giữ, có bản in vN]
       ▼
  in_production (Đang sản xuất - KHÓA MỌI SỬA ĐỔI THIẾT KẾ)
       │
       ├─ [RPC complete_order_production: Xưởng in hoàn thành]
       ▼
   completed (Đã hoàn tất sản xuất & đóng gói giao khách)

* Bất kỳ lúc nào trước khi hoàn tất:
  RPC cancel_order (Admin hủy đơn kèm lý do 3–500 ký tự -> giải phóng tạm giữ, hủy bản nháp, trạng thái -> cancelled)
```

---

## 2. Tiêu chí chặn cổng nghiêm ngặt (Gating Rules)

### Bắt đầu sản xuất (`start_order_production`)
Để chuyển sang `in_production`, đơn hàng BẮT BUỘC thỏa mãn đồng thời:
1. `payment_status = 'paid'` (Đã nhận đủ thanh toán).
2. `design_status = 'approved'` (Thiết kế đã được duyệt).
3. `order_holds.released_at is null` KHÔNG TỒN TẠI (Không có lệnh tạm giữ đang hiệu lực).
4. `production_design_version_id is not null` (Đã có con trỏ bản in sản xuất hợp lệ).
5. `design_revision_drafts` KHÔNG CÓ bản nháp đang mở (`status in ('editing', 'ready_for_review')`).
6. `fulfillment_status in ('unprocessed', 'ready_for_production')`.

### Hoàn tất sản xuất (`complete_order_production`)
1. `fulfillment_status = 'in_production'`.
2. Không có lệnh tạm giữ nào đang hiệu lực.

### Hủy đơn hàng (`cancel_order`)
1. Quyền thực thi: Chỉ dành cho **Quản trị viên (Admin)**.
2. Lý do hủy: Bắt buộc từ 3 đến 500 ký tự tiếng Việt có dấu.
3. Đơn hàng chưa ở trạng thái `completed`.
4. Tự động giải phóng mọi tạm giữ và hủy các bản nháp đang sửa dở.

---

## 3. Triển khai Migration Cơ sở dữ liệu

Thực thi tuần tự trên VPS Supabase:

```sh
# 1. Chạy migration 0005
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0005_state40_fulfillment_operations.sql

# 2. Chạy bộ kiểm thử tự động DB invariants
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state40_fulfillment_operations.sql

# 3. (Tùy chọn trên môi trường dev/staging) Nạp dữ liệu mẫu
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_state40.sql
```

---

## 4. Các lệnh kiểm tra toàn diện

```sh
# Kiểm tra TypeScript type safety
pnpm typecheck

# Chạy toàn bộ 660+ unit tests
pnpm test

# Build production Turbopack
pnpm build
```

---

## 5. Kịch bản kiểm thử giao diện thủ công (QA Matrix)

1. **Đơn sẵn sàng sản xuất**:
   - Truy cập `/admin/orders/[id]` với đơn hàng đã thanh toán và duyệt thiết kế.
   - Thẻ Next Action hiển thị nút xanh: **"Bắt đầu sản xuất"**.
   - Nhấp nút -> Hộp thoại mở ra hiển thị số lượng và phiên bản file in -> Xác nhận -> Đơn chuyển sang `in_production`.
   - Kiểm tra: Nút sửa thiết kế bị khóa, thông báo "Sản xuất đã bắt đầu. Thiết kế hiện được khóa."
2. **Đơn đang sản xuất**:
   - Thẻ Next Action chuyển sang: **"Hoàn tất sản xuất"**.
   - Nhấp nút -> Xác nhận hoàn tất -> Đơn chuyển sang `completed`.
3. **Hủy đơn hàng**:
   - Mở menu thao tác góc phải -> Chọn **"Hủy đơn hàng"** (màu đỏ).
   - Nhập lý do (dưới 3 ký tự báo lỗi) -> Nhập lý do hợp lệ -> Đơn chuyển sang `cancelled`.
   - Kiểm tra Timeline: Ghi nhận sự kiện `order_cancelled` kèm tên Admin và lý do rõ ràng.
