# State 38: Admin Order Detail + Payment Confirmation Runbook

## 1. Quyền hạn & Ma trận trạng thái (RBAC Matrix)

| Vai trò | Xem chi tiết đơn | Xem tiền kiểm & file in | Xác nhận thanh toán | Tạm giữ đơn | Bỏ tạm giữ |
|---|---|---|---|---|---|
| **Admin** | Có | Có (Read-only) | Có (Atomic RPC) | Có (Atomic RPC) | Có (Atomic RPC) |
| **Editor** | Có | Có (Read-only) | Không (Ẩn nút, RPC chặn) | Không (Ẩn nút, RPC chặn) | Không (Ẩn nút, RPC chặn) |
| **Khách / Anon** | Không (401/404) | Không | Không | Không | Không |

### Quy tắc chuyển trạng thái (State Transitions):
1. **Thanh toán**:
   - `pending_payment` hoặc `payment_reported` → `paid`: Chỉ Admin có quyền qua hàm `confirm_order_payment(p_order_id, p_expected_state)`.
   - Bất biến: Không thể quay lại `pending_payment` hay hủy xác nhận thanh toán trong State 38.
   - Idempotency: Gọi lại khi đã `paid` trả về `already_paid` mà không tạo thêm sự kiện trùng lặp.
2. **Tạm giữ đơn (Hold)**:
   - Trạng thái độc lập với tiến trình (payment, design, fulfillment).
   - Tạm giữ qua `hold_order(p_order_id, p_reason)`: Kiểm tra không trùng active hold, yêu cầu lý do 3–500 ký tự, khóa dòng đơn hàng, ghi `order_holds` và sự kiện `order_held`.
   - Bỏ tạm giữ qua `release_order_hold(p_order_id, p_expected_hold_id)`: Xác thực đúng ID tạm giữ hiện tại, cập nhật `released_at`/`released_by`, ghi sự kiện `order_hold_released`.
   - Toàn bộ lịch sử tạm giữ được lưu vĩnh viễn (không bao giờ xóa bản ghi `order_holds`).

## 2. Nguồn dữ liệu chuẩn (Canonical Source of Truth)

- **Thanh toán**: Bảng `order_payments.status` là canonical source of truth. Bảng `orders.payment_status` là trường denormalized phục vụ tìm kiếm/inbox và chỉ được cập nhật trong cùng một transaction của hàm `confirm_order_payment`.
- **Hành động tiếp theo (Next Action)**: Được tính toán tất định (deterministic) thông qua bộ resolver `resolveOrderNextAction` tại tầng domain, không lưu cố định trong cơ sở dữ liệu.

## 3. Thứ tự triển khai Migration & Kiểm thử SQL

Khi triển khai lên môi trường Supabase:

```bash
# 1. Chạy các migrations theo thứ tự
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_state37_core.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_state37_storage.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_state38_order_operations.sql

# 2. Nạp dữ liệu mẫu
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql

# 3. Chạy các kịch bản kiểm thử bảo mật & hàm nghiệp vụ
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state37_rls.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state38_order_operations.sql
```

## 4. Kịch bản Seed dữ liệu mẫu State 38

| Mã đơn | Trạng thái thanh toán | Trạng thái thiết kế | Trạng thái sản xuất | Tạm giữ | Hành động dự kiến (Next Action) |
|---|---|---|---|---|---|
| `QT3801` | `pending_payment` | `awaiting_review` | `unprocessed` | Không | `wait_for_payment` (Đang chờ khách thanh toán) |
| `QT3802` | `payment_reported` | `awaiting_review` | `unprocessed` | Không | `verify_payment` (Khách báo đã chuyển khoản) |
| `QT3803` | `paid` | `awaiting_review` | `unprocessed` | Không | `review_design` (Cần duyệt thiết kế) |
| `QT3804` | `paid` | `approved` | `ready_for_production` | Không | `ready_for_production` (Sẵn sàng sản xuất) |
| `QT3805` | `paid` | `approved` | `ready_for_production` | **Có** | `release_hold` (Đang tạm giữ đơn) |
| `QT3806` | `paid` | `approved` | `in_production` | Không | `production_in_progress` (Đang sản xuất) |
| `QT3807` | `paid` | `approved` | `completed` | Không | `none` (Đơn đã hoàn tất) |

## 5. Xử lý sự cố đồng thời (Concurrency & Conflict Troubleshooting)

- **Xung đột 2 Admin cùng xác nhận**:
  - Admin A gửi yêu cầu trước: Hàm Postgres khóa bản ghi bằng `FOR UPDATE`, chuyển trạng thái sang `paid`, ghi sự kiện.
  - Admin B gửi yêu cầu sau: Gặp trạng thái hiện tại là `paid` hoặc không khớp `p_expected_state`, trả về mã `already_paid` hoặc `state_conflict`.
  - Client của Admin B nhận mã lỗi, tự động refetch dữ liệu chuẩn mới nhất và hiển thị thông báo `Đơn này vừa được cập nhật.` mà không gây lỗi giao diện hay thay đổi dữ liệu sai lệch.
- **Mất kết nối Realtime**:
  - Realtime channel `order:<orderId>` chỉ là tín hiệu gợi ý làm mới (freshness hint), không truyền dữ liệu khách hàng qua WebSocket.
  - Khi mất mạng hoặc tab bị ẩn: Hệ thống tự động kích hoạt refetch khi chuyển lại tab (`visibilitychange`) hoặc khi kết nối mạng phục hồi. Thao tác trên giao diện luôn dựa trên API và Server Action có kiểm tra phiên hợp lệ.
