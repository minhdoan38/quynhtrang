'use client';

import { useEffect } from 'react';
import { reportUnexpectedError } from '@/lib/observability/report.ts';
import { createSupportCode } from '@/lib/reliability/operation-id.ts';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refCode = createSupportCode(error.digest || error.message || 'global_error');

  useEffect(() => {
    reportUnexpectedError({
      operation: 'global_root_error',
      errorCode: error.digest,
      error,
    });
  }, [error]);

  return (
    <html lang="vi">
      <body className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 font-sans text-neutral-900">
        <div className="max-w-md w-full bg-white rounded-xl border border-neutral-200 p-8 text-center shadow-sm space-y-5">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 font-bold text-xl">
            !
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-neutral-900">
              Đã xảy ra sự cố không mong muốn
            </h1>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Hệ thống đã ghi nhận lỗi và đang xử lý. Vui lòng bấm thử lại hoặc tải lại trang.
            </p>
            <p className="text-xs text-neutral-400 font-mono pt-1">
              Mã tham chiếu: {refCode}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="h-10 px-5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Thử lại
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="h-10 px-5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              Về trang chủ
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
