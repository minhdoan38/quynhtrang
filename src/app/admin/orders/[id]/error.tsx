'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export default function OrderDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <Card className="p-8 text-center border-neutral-200 shadow-sm space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">
            Chưa thể tải đơn hàng.
          </h2>
          <p className="text-sm text-neutral-600">
            Đã có lỗi xảy ra trong quá trình tải dữ liệu đơn hàng. Vui lòng thử lại.
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
            href="/admin/orders"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'h-10 px-5 border-neutral-300 hover:bg-neutral-100 text-neutral-700 inline-flex items-center justify-center font-medium'
            )}
          >
            Về danh sách đơn
          </Link>
        </div>
      </Card>
    </div>
  );
}
