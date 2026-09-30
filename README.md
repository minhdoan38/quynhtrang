# Print Product Customizer

Mobile-first, modern web application for personalizing print products: wrapping paper, greeting cards, die-cut stickers, and notebook covers. UI copy is Vietnamese. Built with Next.js (App Router), TypeScript, Tailwind CSS v4, shadcn/ui primitives, and GSAP animations.

## Tech Stack
- **Framework:** Next.js 16+ (App Router, Turbopack)
- **Language:** TypeScript 7+ / React 19+
- **Styling:** Tailwind CSS v4 (CSS-first, OKLCH tokens)
- **UI Components:** shadcn/ui (Radix / Base UI primitives)
- **Animation:** GSAP 3.15+ & `@gsap/react`
- **Package Manager:** pnpm

## Local Setup & Development

```sh
# Cài đặt dependencies
pnpm install

# Khởi chạy development server
pnpm dev

# Typecheck & Tests
pnpm run typecheck
pnpm test

# Build production
pnpm build
```

### Supabase Runbook & Operations
Chi tiết về biến môi trường, thứ tự triển khai SQL, phân quyền tài khoản quản trị viên và cơ chế lưu trữ được tài liệu hóa tại:
[State 37 Supabase Runbook](docs/superpowers/state37-supabase-runbook.md).

### Supabase Migrations & Testing (State 37, 38, 39, 40 & 41)

```sh
# Triển khai migrations
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_state37_core.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_state37_storage.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_state38_order_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_state39_design_revisions.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0005_state40_fulfillment_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0006_state41_account_migration.sql

# Nạp dữ liệu seed
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_state39.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_state40.sql

# Chạy kiểm thử RLS, atomic operations, immutability, fulfillment & account migration
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state37_rls.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state38_order_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state39_design_revisions.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state40_fulfillment_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state41_account_migration.sql

# Vận hành tác vụ nền State 39
node --experimental-strip-types scripts/state39-render-jobs.ts --once
node --experimental-strip-types scripts/state39-asset-gc.ts --dry-run
```

Mở <http://localhost:3000/> trên trình duyệt.

## Project Structure (Standard shadcn)

```text
├── components.json              # Cấu hình shadcn CLI
├── next.config.ts               # Next.js config
├── postcss.config.mjs           # PostCSS Tailwind v4 plugin
├── tsconfig.json                # TypeScript strict config
├── package.json
├── src/
│   ├── app/
│   │   ├── globals.css          # Tailwind v4 theme & product styling
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Entry page
│   ├── components/
│   │   ├── customizer/          # Customizer domain views
│   │   │   ├── bottom-navigation.tsx
│   │   │   ├── checkout-sheet.tsx
│   │   │   ├── confirmation-panel.tsx
│   │   │   ├── customizer-shell.tsx
│   │   │   ├── design-canvas.tsx
│   │   │   ├── preflight-panel.tsx
│   │   │   ├── preview-dialog.tsx
│   │   │   ├── product-chooser.tsx
│   │   │   ├── product-controls.tsx
│   │   │   ├── template-chooser.tsx
│   │   │   └── upload-control.tsx
│   │   └── ui/                  # shadcn UI primitives
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── drawer.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── radio-group.tsx
│   │       ├── slider.tsx
│   │       └── textarea.tsx
│   ├── lib/
│   │   ├── product-state.ts     # Domain models, reducers & pure functions
│   │   ├── storage.ts           # Safe sessionStorage client adapter
│   │   ├── upload.ts            # Object URL & image upload lifecycle
│   │   └── utils.ts             # cn helper
│   └── test/
│       └── product-state.test.ts # Unit tests
└── .agents/skills/              # Local skills (shadcn, gsap, impeccable)
```

## Agent Skills (Project-Local)
Các skills hỗ trợ AI coding đã được cài đặt cục bộ tại `.agents/skills/`:
- `shadcn-ui/ui@shadcn`
- `greensock/gsap-skills@gsap-core`
- `greensock/gsap-skills@gsap-react`
- `pbakaus/impeccable@impeccable`
