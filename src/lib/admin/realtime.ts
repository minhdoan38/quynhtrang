import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export function subscribeToOrderDetailChanges(
  client: SupabaseClient,
  orderId: string,
  onSignal: () => void,
  onReconnect?: () => void,
): () => void {
  if (!client || !orderId) {
    return () => { };
  }

  let debounceTimer: NodeJS.Timeout | number | undefined;
  const notify = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onSignal();
    }, 150);
  };

  const channelName = `order:${orderId}`;
  const channel: RealtimeChannel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      () => notify()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'order_payments',
        filter: `order_id=eq.${orderId}`,
      },
      () => notify()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'order_holds',
        filter: `order_id=eq.${orderId}`,
      },
      () => notify()
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_events',
        filter: `order_id=eq.${orderId}`,
      },
      () => notify()
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && onReconnect) {
        onReconnect();
      }
    });

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      notify();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return () => {
    clearTimeout(debounceTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    client.removeChannel(channel);
  };
}

export function subscribeToOrderChanges(
  client: SupabaseClient,
  onChange: (orderId?: string) => void,
  onReconnect?: () => void,
): () => void {
  if (!client) {
    return () => { };
  }

  let timer: NodeJS.Timeout | number | undefined;
  let active = true;

  const notify = () => {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (active) onChange();
    }, 150);
  };

  const channel = client
    .channel('admin:orders')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => notify(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'order_payments' },
      () => notify(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'order_holds' },
      () => notify(),
    )
    .subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') {
        notify();
        if (onReconnect) onReconnect();
      }
    });

  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      notify();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    clearTimeout(timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    client.removeChannel(channel);
  };
}
// ponytail: single global channel for orders inbox without client-side filter trees → skipped: per-tab channel multiplexing, add when message volume degrades client throughput.
