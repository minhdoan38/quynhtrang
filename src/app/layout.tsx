import type { Metadata } from 'next';
import { Lora, Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';

const lora = Lora({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Quỳnh Trang — Tự thiết kế sản phẩm in',
  description: 'Tùy biến giấy gói quà, thiệp, sticker và bìa sổ tay thủ công mang dấu ấn riêng.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} ${lora.variable}`}>
      <body className="antialiased min-h-screen font-sans bg-[#FFFDF8] text-[#2E3338] selection:bg-[#DCEBF4] selection:text-[#244A69]">
        {children}
      </body>
    </html>
  );
}
