# Next.js, Tailwind v4, shadcn/ui & GSAP Migration Design

## 1. Mục tiêu
Chuyển đổi dự án Print Product Customizer từ vanilla static JS/HTML/CSS sang Next.js App Router (TypeScript), Tailwind CSS v4, shadcn/ui, và GSAP. Cài đặt các agent skill dự án cục bộ (`impeccable`, `gsap`, `shadcn`). Giữ nguyên 100% logic nghiệp vụ, tính năng, và dữ liệu phiên hiện có.

## 2. Tech Stack (Latest)
- **Framework**: Next.js 16+ (App Router, `src/` directory)
- **Language**: TypeScript 7+ / React 19+
- **Styling**: Tailwind CSS v4 (CSS-first, `@import "tailwindcss";`)
- **UI Primitives**: shadcn/ui CLI (dùng Radix/Base UI components)
- **Animation**: GSAP 3.15+ & `@gsap/react`
- **Package Manager**: pnpm
- **Testing**: Node test runner hoặc Vitest cho TypeScript domain tests

## 3. Project-Local Agent Skills
Cài đặt cục bộ vào project (`--copy` / `.agents` hoặc folder project) thông qua Skills CLI:
- `shadcn-ui/ui@shadcn`
- `greensock/gsap-skills@gsap-core`
- `greensock/gsap-skills@gsap-react`
- `pbakaus/impeccable@impeccable`

## 4. Cấu trúc thư mục chuẩn shadcn
```text
.
├── components.json
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/
    │   ├── customizer/
    │   │   ├── bottom-navigation.tsx
    │   │   ├── checkout-sheet.tsx
    │   │   ├── confirmation-panel.tsx
    │   │   ├── customizer-shell.tsx
    │   │   ├── design-canvas.tsx
    │   │   ├── preflight-panel.tsx
    │   │   ├── preview-dialog.tsx
    │   │   ├── product-chooser.tsx
    │   │   ├── product-controls.tsx
    │   │   ├── template-chooser.tsx
    │   │   └── upload-control.tsx
    │   └── ui/
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── dialog.tsx
    │       ├── drawer.tsx
    │       ├── input.tsx
    │       ├── label.tsx
    │       ├── radio-group.tsx
    │       ├── slider.tsx
    │       ├── textarea.tsx
    │       └── toast.tsx
    ├── lib/
    │   ├── product-state.ts
    │   ├── storage.ts
    │   ├── upload.ts
    │   └── utils.ts
    └── test/
        └── product-state.test.ts
```

## 5. Domain & State Management
- `src/lib/product-state.ts`: Port toàn bộ `PRODUCTS`, `TEMPLATES`, `createInitialState`, `transitionState`, `getDesignSummary`, `getPreflight` sang TypeScript strict.
- `src/lib/storage.ts`: Quản lý `sessionStorage` (`print-customizer-state-v1`, `print-customizer-order-v1`).
- `src/lib/upload.ts`: Quản lý blob object URL và lifecycle giải phóng bộ nhớ.

## 6. Animations (GSAP)
- Tích hợp qua hook `useGSAP` từ `@gsap/react`.
- Áp dụng có chọn lọc cho:
  - Transition mượt mà khi switch sản phẩm trên canvas.
  - Modal preview và checkout mở/đóng.
  - Visual feedback khi chọn template hoặc tải ảnh.
- Tuân thủ `prefers-reduced-motion`.

## 7. Migration & Clean Cutover
- Khởi tạo Next.js, Tailwind v4, shadcn, GSAP.
- Chuyển domain logic và viết test TypeScript.
- Dựng UI components bằng Tailwind + shadcn.
- Nối state, storage, upload logic.
- Verify toàn bộ flow trên trình duyệt.
- Xóa các file cũ: `index.html`, `styles.css`, `app.js`, `product-state.js`, `product-state.test.mjs`.
