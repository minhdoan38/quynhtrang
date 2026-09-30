import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeToOrderDetailChanges } from '../lib/admin/realtime.ts';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

describe('subscribeToOrderDetailChanges', () => {
  it('subscribes to private order channel and cleans up on unmount', () => {
    let capturedChannelName = '';
    const capturedListeners: Array<{ event: string; table: string; filter: string }> = [];
    let removedChannel: RealtimeChannel | null = null;

    const mockChannel = {
      on(event: string, filterConfig: { event: string; schema: string; table: string; filter: string }, callback: () => void) {
        capturedListeners.push({
          event: filterConfig.event,
          table: filterConfig.table,
          filter: filterConfig.filter,
        });
        return this;
      },
      subscribe(callback: (status: string) => void) {
        callback('SUBSCRIBED');
        return this;
      },
    } as unknown as RealtimeChannel;

    const fakeClient = {
      channel(name: string) {
        capturedChannelName = name;
        return mockChannel;
      },
      removeChannel(channel: RealtimeChannel) {
        removedChannel = channel;
      },
    } as unknown as SupabaseClient;

    let signalCount = 0;
    let reconnectCount = 0;

    const unsubscribe = subscribeToOrderDetailChanges(
      fakeClient,
      'order-1042',
      () => {
        signalCount++;
      },
      () => {
        reconnectCount++;
      }
    );

    assert.equal(capturedChannelName, 'order:order-1042');
    assert.equal(reconnectCount, 1);
    assert.equal(capturedListeners.length, 4);

    const tables = capturedListeners.map((l) => l.table);
    assert.ok(tables.includes('orders'));
    assert.ok(tables.includes('order_payments'));
    assert.ok(tables.includes('order_holds'));
    assert.ok(tables.includes('order_events'));

    unsubscribe();
    assert.equal(removedChannel, mockChannel);
  });
});
