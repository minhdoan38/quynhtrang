import Link from 'next/link';
import { headers } from 'next/headers.js';

export default async function AdminContentLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const pathname =
    headerStore.get('x-admin-pathname') ||
    headerStore.get('x-pathname') ||
    headerStore.get('next-url') ||
    '';

  const isFonts = pathname.includes('/admin/content/fonts');
  const isStickers = pathname.includes('/admin/content/stickers') || (!isFonts && pathname.includes('/admin/content'));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Thư viện nội dung</h1>
          <p className="text-xs text-stone-500 mt-1">Quản lý sticker và kiểu chữ cho xưởng in và khách hàng</p>
        </div>

        <nav className="flex items-center gap-2" aria-label="Phân mục thư viện nội dung">
          <Link
            href="/admin/content/stickers"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${isStickers
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
          >
            Sticker
          </Link>
          <Link
            href="/admin/content/fonts"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${isFonts
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
          >
            Kiểu chữ (Fonts)
          </Link>
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
