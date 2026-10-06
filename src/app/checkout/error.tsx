'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';
import { reportUnexpectedError } from '@/lib/observability/report.ts';
import { createSupportCode } from '@/lib/reliability/operation-id.ts';

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = createSupportCode(error.digest || error.message || 'checkout');

  useEffect(() => {
    reportUnexpectedError({
      operation: 'checkout_view',
      route: '/checkout',
      errorCode: error.digest,
      error,
    });
  }, [error]);

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <Card className="p-8 text-center border-neutral-200 shadow-sm space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">
            Chưa thể tải trang thanh toán.
          </h2>
          <p className="text-sm text-neutral-600">
            Đã có sự cố khi chuẩn bị thông tin thanh toán. Vui lòng thử lại hoặc quay lại trang chủ.
          </p>
          <p className="text-xs text-neutral-400 font-mono">
            Mã tham chiếu: {refCode}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            onClick={() => reset()}
            className="h-10 px-5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium"
          >
            Thử lại
          </Button>
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'h-10 px-5 border-neutral-300 hover:bg-neutral-100 text-neutral-700 inline-flex items-center justify-center font-medium'
            )}
          >
            Về trang chủ
          </Link>
        </div>
      </Card>
    </div>
  );
}
