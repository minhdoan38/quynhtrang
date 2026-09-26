# Next.js, shadcn/ui, Tailwind v4 & GSAP Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi toàn bộ app customizer in ấn sang Next.js App Router, TypeScript, Tailwind v4, shadcn/ui, GSAP với cấu trúc chuẩn và cài đặt agent skills cục bộ.

**Architecture:** Single Page App trên Next.js App Router với `src/` directory. Domain logic pure TypeScript trong `src/lib/product-state.ts`. UI chia nhỏ theo nguyên tắc shadcn (`src/components/ui/` primitives, `src/components/customizer/` domain views). GSAP phụ trách transitions mượt mà qua `@gsap/react`.

**Tech Stack:** Next.js 16+, React 19+, TypeScript 7+, Tailwind CSS 4+, shadcn/ui CLI, GSAP 3.15+, @gsap/react 2.1+, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-26-nextjs-shadcn-migration-design.md`

## Global Constraints
- Giữ nguyên 100% tính năng hiện có: 4 sản phẩm, template, text, màu, upload ảnh, options theo sản phẩm, preview, preflight, checkout demo, QR unverified.
- Không thêm backend thật, không gọi external payment, không lưu DB ngoài `sessionStorage`.
- Cài agent skills cục bộ project (`--copy`), không cài global.
- Clean cutover: Xóa bỏ các file static cũ (`index.html`, `styles.css`, `app.js`, `product-state.js`, `product-state.test.mjs`) sau khi hoàn thiện.

## Review Focus
1. Hydration mismatch: `sessionStorage` chỉ đọc sau khi component mounted ở client.
2. GSAP cleanup: Sử dụng `useGSAP` với scope hợp lệ, không gây memory leak hoặc layout thrashing.
3. Object URL lifecycle: Thu hồi `URL.revokeObjectURL` cho ảnh tải lên khi đổi ảnh hoặc unmount.
4. Responsive: Layout chuẩn chỉnh trên cả mobile (390px) và desktop (1440px).
5. Accessibility: Giữ ARIA labels, semantic roles và focus trap cho modals/sheets.

---

### Task 1: Cài đặt Agent Skills cục bộ và khởi tạo dự án Next.js
**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `components.json`
- Skills: `.agents/skills/` hoặc `.claude/skills/`

- [ ] **Step 1: Cài đặt skills cục bộ bằng Skills CLI**
Run:
```bash
npx skills add shadcn-ui/ui@shadcn -y --copy
npx skills add greensock/gsap-skills@gsap-core -y --copy
npx skills add greensock/gsap-skills@gsap-react -y --copy
npx skills add pbakaus/impeccable@impeccable -y --copy
```

- [ ] **Step 2: Khởi tạo Next.js, TypeScript, Tailwind v4, shadcn, GSAP**
Run:
```bash
pnpm init
pnpm add next@latest react@latest react-dom@latest gsap@latest @gsap/react@latest clsx tailwind-merge lucide-react
pnpm add -D typescript@latest @types/node@latest @types/react@latest @types/react-dom@latest tailwindcss@latest @tailwindcss/postcss@latest postcss@latest
npx shadcn@latest init -y -d
```

- [ ] **Step 3: Cài đặt các UI primitives từ shadcn**
Run:
```bash
npx shadcn@latest add button card dialog drawer input label radio-group slider textarea
```

- [ ] **Step 4: Kiểm tra build & typecheck rỗng**
Run: `pnpm exec tsc --noEmit`
Expected: PASS

---

### Task 2: Chuyển đổi Domain Model sang TypeScript
**Files:**
- Create: `src/lib/product-state.ts`
- Create: `src/test/product-state.test.ts`

- [ ] **Step 1: Viết test cho domain types và state transitions**
Port toàn bộ test cases từ `product-state.test.mjs` sang TypeScript.

- [ ] **Step 2: Implement domain logic với type safety đầy đủ**
Port `PRODUCTS`, `TEMPLATES`, `createInitialState`, `transitionState`, `getDesignSummary`, `getPreflight`.

- [ ] **Step 3: Chạy test xác nhận domain hoạt động đúng 100%**
Run: `node --test --experimental-strip-types src/test/product-state.test.ts`
Expected: PASS toàn bộ test.

---

### Task 3: Xây dựng Customizer UI Components với Tailwind & shadcn
**Files:**
- Create: `src/components/customizer/design-canvas.tsx`
- Create: `src/components/customizer/product-chooser.tsx`
- Create: `src/components/customizer/template-chooser.tsx`
- Create: `src/components/customizer/product-controls.tsx`
- Create: `src/components/customizer/bottom-navigation.tsx`
- Create: `src/components/customizer/preview-dialog.tsx`
- Create: `src/components/customizer/preflight-panel.tsx`
- Create: `src/components/customizer/checkout-sheet.tsx`
- Create: `src/components/customizer/confirmation-panel.tsx`

- [ ] **Step 1: Implement Canvas và Product Mockup components**
Hỗ trợ hiển thị canvas cho 4 sản phẩm (giấy gói quà, thiệp, sticker, sổ tay) bằng Tailwind v4 classes.

- [ ] **Step 2: Implement Controls (chọn sản phẩm, khổ, template, text, màu sắc, options theo sản phẩm)**
Sử dụng primitives từ shadcn (`RadioGroup`, `Slider`, `Input`, `Textarea`, `Card`).

- [ ] **Step 3: Implement Modals & Sheets (Preview, Preflight, Checkout form, Confirmation QR)**
Sử dụng `Dialog` và `Drawer` của shadcn với đầy đủ validation và accessibility.

---

### Task 4: Nối State, GSAP Animations và tích hợp Shell
**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/lib/upload.ts`
- Create: `src/components/customizer/customizer-shell.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Implement storage & upload lifecycle adapters**
Tự động lưu/đọc `sessionStorage` sau mount, revoke object URLs cũ khi đổi ảnh.

- [ ] **Step 2: Tích hợp GSAP qua `useGSAP`**
Thêm animation mượt mà khi đổi sản phẩm trên canvas và khi chuyển đổi giữa editor/preview/checkout.

- [ ] **Step 3: Lắp ráp toàn bộ luồng tại `CustomizerShell` và `src/app/page.tsx`**

---

### Task 5: Clean Cutover, Xóa tệp cũ và Verification hoàn tất
**Files:**
- Remove: `index.html`, `styles.css`, `app.js`, `product-state.js`, `product-state.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Xóa các tệp tĩnh cũ**
Run: `rm index.html styles.css app.js product-state.js product-state.test.mjs`

- [ ] **Step 2: Chạy kiểm tra tĩnh toàn bộ dự án**
Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: Build thành công không lỗi type, không lỗi bundling.

- [ ] **Step 3: Khởi động dev server và chạy browser smoke test**
Khởi động Next.js dev server, mở trình duyệt kiểm tra:
1. Đổi 4 sản phẩm và các biến thể.
2. Sửa chữ, đổi màu, tải ảnh, điều chỉnh thanh trượt.
3. Mở Preview + Preflight.
4. Điền form checkout demo và xác nhận hiện QR unverified.
5. Kiểm tra console không có lỗi và animations chạy trơn tru.

- [ ] **Step 4: Cập nhật README.md**
Cập nhật hướng dẫn chạy `pnpm dev`, kiến trúc Next.js + shadcn + GSAP mới.
