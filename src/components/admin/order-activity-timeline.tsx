import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { OrderActivityItem } from '@/lib/domain/order';
import { History, Clock, ArrowDown } from 'lucide-react';

export interface OrderActivityTimelineProps {
  orderId: string;
  initialEvents: OrderActivityItem[];
  initialCursor: string | null;
}

export function OrderActivityTimeline({
  orderId,
  initialEvents,
  initialCursor,
}: OrderActivityTimelineProps) {
  const [events, setEvents] = useState<OrderActivityItem[]>(initialEvents);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleLoadMore = async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/events?limit=20&cursor=${encodeURIComponent(cursor)}`
      );
      if (!res.ok) {
        throw new Error('Chưa thể tải thêm hoạt động.');
      }
      const data = (await res.json()) as { items: OrderActivityItem[]; nextCursor: string | null };
      setEvents((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch {
      setLoadError('Không thể tải thêm hoạt động. Vui lòng thử lại.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <Card className="p-6 bg-white border-neutral-200 shadow-xs space-y-5">
      <div className="flex items-center gap-2.5">
        <History className="w-5 h-5 text-neutral-500" />
        <h3 className="text-base font-semibold text-neutral-900">Lịch sử hoạt động</h3>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4 text-center">Chưa có hoạt động.</p>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-neutral-200">
          {events.map((event) => {
            let dotColor = 'bg-neutral-400';
            if (event.actor.kind === 'customer') dotColor = 'bg-amber-500';
            else if (event.actor.kind === 'staff') dotColor = 'bg-primary-600 bg-blue-600';

            return (
              <div key={event.id} className="relative group text-sm">
                <span
                  className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white ${dotColor}`}
                />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-neutral-900">{event.title}</span>
                    <span className="text-xs text-neutral-500">
                      bởi <strong className="font-medium text-neutral-700">{event.actor.displayName}</strong>
                    </span>
                  </div>

                  {event.description && (
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      {event.description}
                    </p>
                  )}

                  <div className="flex items-center gap-1 text-xs text-neutral-400 pt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(event.createdAt).toLocaleString('vi-VN')}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loadError && (
        <p className="text-xs text-rose-600 text-center">{loadError}</p>
      )}

      {cursor && (
        <div className="pt-2 text-center">
          <Button
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            size="sm"
            className="h-9 px-4 border-neutral-300 text-neutral-700 hover:bg-neutral-50 text-xs font-medium"
          >
            {isLoadingMore ? (
              'Đang tải...'
            ) : (
              <>
                <ArrowDown className="w-3.5 h-3.5 mr-1.5" />
                <span>Xem thêm hoạt động</span>
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
