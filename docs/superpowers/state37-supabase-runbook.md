# State 37: Supabase Backend & Operations Runbook

Hướng dẫn triển khai, vận hành cơ sở dữ liệu Supabase, xác thực tài khoản quản trị viên và bảo mật lưu trữ cho hệ thống Quỳnh Trang Studio.

---

## 1. Biến môi trường (Environment Variables)

Hệ thống phân tách nghiêm ngặt giữa biến công khai trên client và biến bí mật chỉ chạy trên server:

### A. Biến an toàn trên Client (Trình duyệt)
Được Next.js đóng gói vào mã nguồn chạy trên trình duyệt:
- `NEXT_PUBLIC_SUPABASE_URL`: Đường dẫn URL endpoint của Supabase project (ví dụ: `https://xyzcompany.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Anon/publishable key của project. Có quyền truy cập giới hạn theo Row Level Security (RLS). Có thể dùng alias `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### B. Biến bảo mật Server-only (TUYỆT ĐỐI KHÔNG để lộ ra Client)
Chỉ được đọc bởi server Next.js (Server Components, Route Handlers, Server Actions):
- `SUPABASE_URL`: URL nội bộ hoặc URL Supabase (nếu khác với public URL).
- `SUPABASE_SECRET_KEY`: Service role secret key của Supabase. Cho phép bypass RLS để thực hiện các nghiệp vụ backend (tạo đơn, lưu trữ tài sản đơn hàng). Có thể dùng alias `SERVICE_SUPABASESERVICE_KEY` hoặc `SUPABASE_SERVICE_ROLE_KEY`.

> **Cảnh báo bảo mật:** Không bao giờ đặt tiền tố `NEXT_PUBLIC_` cho `SUPABASE_SECRET_KEY`. Ứng dụng sẽ tự động từ chối và ném ngoại lệ nếu phát hiện secret key bị gắn tiền tố public.

---

## 2. Trình tự triển khai SQL trên VPS / Database

Khi thiết lập database mới hoặc cập nhật môi trường staging/production, thực hiện theo đúng thứ tự sau:

```bash
# 1. Khởi tạo cấu trúc bảng, RLS và hàm sinh mã đơn hàng
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_state37_core.sql

# 2. Cấu hình Storage buckets (customer-assets, approved-renders, fonts, stickers) và chính sách bảo mật
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_state37_storage.sql

# 3. Nạp dữ liệu seed ban đầu (sản phẩm, mẫu in, font chữ chuẩn và đơn hàng mẫu)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql

# 4. Chạy bộ kiểm thử tự động RLS và phân quyền truy cập
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state37_rls.sql
```

> **Nguyên tắc chấp nhận:** Không đưa hệ thống vào phục vụ nếu lệnh test RLS `supabase/tests/state37_rls.sql` gặp bất kỳ lỗi nào.

---

## 3. Khởi tạo tài khoản nhân viên (Staff Bootstrap)

Hệ thống không cung cấp giao diện đăng ký công khai cho nhân viên. Việc tạo tài khoản quản trị được thực hiện có kiểm soát:

### Bước 1: Tạo tài khoản Auth
Tạo người dùng mới trong Supabase Dashboard (Authentication -> Users -> Add User) hoặc qua Supabase CLI/API với email và mật khẩu an toàn. Lấy `UUID` của người dùng vừa tạo.

### Bước 2: Phân quyền trong bảng `staff_roles`
Chạy câu lệnh SQL sau để cấp quyền cho nhân viên:

```sql
-- Cấp quyền Quản trị viên (Admin - toàn quyền xử lý thanh toán, tạm giữ, hủy và sản xuất)
INSERT INTO public.staff_roles (user_id, role)
VALUES ('<USER_UUID>', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- Hoặc cấp quyền Biên tập viên (Editor - xem đơn hàng và kiểm tra thiết kế, không thao tác thanh toán)
INSERT INTO public.staff_roles (user_id, role)
VALUES ('<USER_UUID>', 'editor')
ON CONFLICT (user_id) DO UPDATE SET role = 'editor';
```

### Bước 3: Đăng nhập
Truy cập `/admin/login` trên trình duyệt để đăng nhập bằng tài khoản vừa tạo. Hệ thống sẽ tự động chuyển hướng đến `/admin/orders`.

---

## 4. Cơ chế lưu trữ và Phục hồi (Storage & Recovery)

### Phân vùng Storage Buckets
- `customer-assets` (**Private**): Chứa hình ảnh gốc và tài sản do khách hàng tải lên khi tùy biến sản phẩm. Chỉ server và nhân viên có quyền truy cập qua signed URL.
- `approved-renders` (**Private**): Chứa bản render thiết kế đã được phê duyệt in. Ảnh thumbnail hiển thị trên Admin Inbox được tạo qua signed URL có thời hạn ngắn (1 giờ).
- `template-assets` (**Public**): Ảnh thumbnail và tư liệu của các mẫu thiết kế có sẵn.
- `fonts` (**Public**): Tệp phông chữ phục vụ trình biên tập và render chữ tiếng Việt.
- `sticker-library` (**Public**): Thư viện hình dán trang trí.

### Đảm bảo tính bất biến (Immutability) & Idempotency
- Khi khách hàng nhấn Tiếp tục tại Bước 2 (State 35), đơn hàng được gửi kèm `idempotencyKey`. Nếu kết nối mạng gián đoạn và khách gửi lại, server trả về đúng đơn hàng đã tạo thay vì tạo đơn thứ hai.
- Phiên bản thiết kế phê duyệt (`design_versions`) mang tính bất biến (`source: customer_approved`). Mọi chỉnh sửa sau này của nhân viên sẽ tạo bản sửa đổi mới (`staff_draft` hoặc revision kế tiếp), không bao giờ ghi đè lên bản gốc khách đã duyệt.

---

## 5. Xử lý sự cố thường gặp (Troubleshooting)

1. **Lỗi 401 Unauthorized khi vào `/admin/orders`:**
   - Kiểm tra xem cookie session Supabase có tồn tại không.
   - Thử đăng nhập lại tại `/admin/login`.
2. **Lỗi 403 Forbidden sau khi đã đăng nhập:**
   - Người dùng đã xác thực Auth nhưng chưa được gán role trong bảng `staff_roles`.
   - Thực hiện lại Bước 2 trong mục 3 để cấp quyền.
3. **Ảnh thumbnail đơn hàng không hiển thị trong Admin:**
   - Kiểm tra xem bucket `approved-renders` đã được tạo qua migration `0002_state37_storage.sql` chưa.
   - Kiểm tra quyền gọi API tạo signed URL của `SUPABASE_SECRET_KEY`.
