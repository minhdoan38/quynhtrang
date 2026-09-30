# State 41: Account Migration / Guest → Account Architecture & Design Specification

Tài liệu thiết kế kiến trúc và hướng dẫn kiểm thử cho tính năng tạo tài khoản khách hàng không mật khẩu (passwordless email OTP) và di chuyển dữ liệu khách vãng lai an toàn vào tài khoản (State 41).

---

## 1. Mục tiêu và Nguyên tắc cốt lõi

1. **Khách vãng lai giữ vững nguyên tắc local-first:**
   - Người dùng mới vào trang customizer vẫn lưu trữ tối đa 3 dự án trên `localStorage`, thời hạn lưu trữ 30 ngày (TTL).
   - Tuyệt đối không tạo người dùng ẩn danh (`signInAnonymously()`) khi khách vừa mở trang web.

2. **Lời mời tạo tài khoản sau thanh toán (Post-checkout):**
   - Lời mời lưu vào tài khoản xuất hiện một cách tinh tế, không ép buộc (unforced) trên màn hình Xác nhận đơn hàng (State 36 Order Confirmation).
   - Khách có thể chọn "Lưu vào tài khoản" hoặc "Để sau". Nút "Để sau" đóng thẻ nhẹ nhàng mà không làm phiền.

3. **Bằng chứng liên kết đơn hàng chặt chẽ (Strict Claim Proof):**
   - Đơn hàng chỉ có thể được liên kết vào tài khoản khi người dùng cung cấp đồng thời:
     - Phiên đăng nhập hợp lệ (`auth.uid()`).
     - Token xác thực khách ban đầu khớp với bảng `guest_order_access`.
   - Tuyệt đối không tự động liên kết đơn hàng chỉ dựa trên số điện thoại hoặc email trùng khớp.

4. **Tính lũy kế & Chống trùng lặp (Idempotent Migration):**
   - Khi khách đăng nhập, các dự án hợp lệ trên máy khách (chưa quá hạn 30 ngày) được đồng bộ lên đám mây.
   - Dựa trên khóa `(owner_user_id, origin_local_project_id)` để đảm bảo nếu mạng chập chờn hoặc đăng nhập lại nhiều lần, không bao giờ sinh ra các bản ghi dự án hoặc tệp nhị phân trùng lặp.

5. **Đảo chiều nguồn chân lý (Source of Truth Inversion):**
   - Sau khi dự án được lưu vào tài khoản, dữ liệu đám mây (`projects.working_document`) trở thành nguồn chân lý chính thức.
   - Trình duyệt đóng vai trò bộ nhớ đệm (cache) và công cụ phục hồi ngoại tuyến.

6. **Kiểm tra phiên bản tuần tự (Monotonic Cloud Revision):**
   - Mỗi lần lưu trên đám mây tăng `current_working_revision` lên 1 thông qua RPC `save_customer_project_revision`.
   - Nếu thiết bị khác đã lưu phiên bản mới hơn, máy chủ trả về `STALE_REVISION` để thông báo cho người dùng tải lại bản mới, chống ghi đè âm thầm.

7. **Bảo mật và Phân quyền (Security & Customer Projection):**
   - Khách hàng đăng nhập có vai trò khách hàng thông thường, tuyệt đối không truy cập được các đường dẫn `/admin/*` hoặc các hàm RPC quản trị.
   - Các hình ảnh riêng tư của khách hàng trong bucket `customer-assets` được bảo vệ với tiêu đề `Cache-Control: private, max-age=3600, no-transform`.

---

## 2. Triển khai Migration Cơ sở dữ liệu

Thực thi tuần tự trên VPS Supabase:

```sh
# 1. Chạy migration 0006
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0006_state41_account_migration.sql

# 2. Chạy bộ kiểm thử tự động DB invariants
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state41_account_migration.sql
```

---

## 3. Các Endpoint & Thành phần chính

| Tuyến đường / Thành phần | Chức năng |
|---|---|
| `/login` | Đăng nhập tài khoản không mật khẩu qua mã OTP gửi về email |
| `/my-designs` | Cổng thông tin "Thiết kế của tôi", hiển thị danh sách dự án đám mây |
| `/my-orders` | Danh sách đơn hàng an toàn của khách hàng |
| `/my-orders/[id]` | Chi tiết đơn hàng hiển thị bản thiết kế khách duyệt ban đầu |
| `claim_guest_order_and_project` | RPC nguyên tử nhận quyền sở hữu đơn hàng và dự án |
| `save_customer_project_revision` | RPC kiểm tra số hiệu bản nháp tuần tự chống xung đột |
| `get_customer_orders` | Phép chiếu đơn hàng an toàn cho khách (ẩn ghi chú nội bộ, hold, staff) |

---

## 4. Kịch bản kiểm thử thủ công (QA Checklist)

1. **Khách tùy biến và thanh toán**:
   - Tùy biến sản phẩm bất kỳ, tiến hành Đặt in và Xác nhận thanh toán.
   - Màn hình xác nhận hiển thị thẻ: "Lưu đơn hàng vào tài khoản".
2. **Nhận mã OTP & Lưu vào tài khoản**:
   - Bấm "Lưu vào tài khoản", nhập địa chỉ email -> Nhận mã OTP 6 chữ số (xem tại Inbucket hoặc hộp thư).
   - Nhập OTP -> Hệ thống tự động liên kết đơn hàng và chuyển các dự án trên máy lên đám mây.
   - Thẻ chuyển sang: "✓ Đã lưu đơn hàng vào tài khoản của bạn".
3. **Truy cập /my-designs & /my-orders**:
   - Vào menu góc trên -> "Thiết kế của tôi" -> Thấy bản vẽ hiển thị đầy đủ, bấm "Tiếp tục chỉnh sửa" mở Customizer.
   - Vào "Đơn hàng của tôi" -> Thấy đơn vừa tạo với mã đơn, trạng thái an toàn và tổng tiền chuẩn xác.
4. **Kiểm tra bảo mật**:
   - Khách đăng nhập không thể truy cập `/admin`.
   - Đăng xuất -> Không còn xem được `/my-designs` và tự chuyển hướng về `/login`.
