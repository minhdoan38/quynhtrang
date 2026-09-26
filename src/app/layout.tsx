import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tự thiết kế sản phẩm in',
  description: 'Tự thiết kế sản phẩm in cá nhân của bạn.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
