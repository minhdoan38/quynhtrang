import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingProducts() {
  return <section aria-busy="true" aria-label="Đang tải cấu hình sản phẩm" className="flex flex-col gap-4"><p role="status">Đang tải cấu hình sản phẩm…</p><Skeleton className="h-10 w-48" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></section>;
}
