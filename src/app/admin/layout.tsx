import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quản trị đơn hàng — Quỳnh Trang',
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-neutral-50/60 text-neutral-900 font-sans">
      {children}
    </div>
  );
}
