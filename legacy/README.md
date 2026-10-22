# Thư mục lưu trữ lịch sử (Legacy Archive)

Thư mục này là **kho lưu trữ tham khảo chỉ đọc (reference-only archive)** dành cho các thành phần thử nghiệm hoặc bản sao lưu mã nguồn lịch sử đã ngừng sử dụng trong luồng vận hành chính thức của Quỳnh Trang Studio.

## 1. Thành phần lưu trữ

- **`legacy/demo-checkout/`**:
  - `checkout-sheet.tsx`: Popup modal checkout demo ban đầu (đã được thay thế hoàn toàn bởi trang đặt in độc lập `/checkout` tại `src/app/checkout/page.tsx`).
  - `confirmation-panel.tsx`: Component biên nhận demo ban đầu và kiểu dữ liệu `DemoOrder`.
  - `order-storage.ts`: Đoạn mã thao tác lưu `DemoOrder` vào `sessionStorage` với khóa lịch sử `print-customizer-order-v1`, được giữ lại thuần túy để tra cứu lịch sử mã nguồn.
- **`legacy/state-36-backup/`**:
  - Bản sao lưu nguyên vẹn từ giai đoạn State 36 (trước khi chuyển đổi sang kiến trúc order snapshot, price quote và Supabase server store ở State 37–45).
  - Các route và file test trong này không phải là endpoint hoạt động và không nằm trong phạm vi chạy kiểm thử của CI.

## 2. Nguyên tắc vận hành

- **Không import vào mã nguồn chính**: Toàn bộ thư mục `legacy/` bị cô lập khỏi `src/`, `scripts/` và `e2e/`. Không có bất kỳ module hoạt động nào được import từ thư mục này.
- **Cô lập khỏi trình biên dịch và kiểm tra**: `tsconfig.json` và `eslint.config.mjs` loại trừ `legacy/` để tránh ảnh hưởng đến quá trình `typecheck`, `lint` hay `build` của dự án.
- **Không có CI / Test Entrypoint**: Các file test trong thư mục này không được gom vào lệnh chạy kiểm thử tự động (`pnpm test` hay `pnpm run test:e2e`).
- **Quy trình phục hồi**: Mọi ý định phục hồi hoặc tái sử dụng bất kỳ đoạn mã nào từ thư mục này bắt buộc phải trải qua quy trình di chuyển vào `src/` kèm theo việc đáp ứng các ràng buộc bảo mật, RBAC, monotonic revision và release gate hiện hành.
