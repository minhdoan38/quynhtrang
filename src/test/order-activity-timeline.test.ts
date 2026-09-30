import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapOrderActivityItem,
  type StaffIdentity,
} from '../lib/domain/order.ts';
import { OrderEventRepository } from '../lib/repositories/order-event-repository.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('mapOrderActivityItem', () => {
  const staffMap = new Map<string, string>([
    ['staff-admin-1', 'Quản trị viên Trang'],
    ['staff-editor-2', 'Biên tập viên Minh'],
  ]);

  it('maps order_created to System / Đơn hàng được tạo', () => {
    const item = mapOrderActivityItem({
      id: 'event-1',
      event_type: 'order_created',
      actor_role: 'customer',
      created_at: '2026-09-30T10:00:00Z',
    });

    assert.equal(item.eventType, 'order_created');
    assert.equal(item.title, 'Đơn hàng được tạo');
    assert.equal(item.actor.kind, 'system');
    assert.equal(item.actor.displayName, 'Hệ thống');
  });

  it('maps customer_payment_reported to Customer / Báo đã chuyển khoản with reference', () => {
    const item = mapOrderActivityItem({
      id: 'event-2',
      event_type: 'customer_payment_reported',
      actor_role: 'customer',
      payload: { ref: 'VQR-QT1042' },
      created_at: '2026-09-30T10:05:00Z',
    });

    assert.equal(item.eventType, 'customer_payment_reported');
    assert.equal(item.title, 'Báo đã chuyển khoản');
    assert.equal(item.actor.kind, 'customer');
    assert.equal(item.actor.displayName, 'Khách hàng');
    assert.equal(item.description, 'Mã tham chiếu: VQR-QT1042');
  });

  it('maps payment_confirmed to staff display name / Đã xác nhận thanh toán with amount', () => {
    const item = mapOrderActivityItem(
      {
        id: 'event-3',
        event_type: 'payment_confirmed',
        actor_user_id: 'staff-admin-1',
        actor_role: 'admin',
        payload: { amount: 200000 },
        created_at: '2026-09-30T10:10:00Z',
      },
      staffMap
    );

    assert.equal(item.eventType, 'payment_confirmed');
    assert.equal(item.title, 'Đã xác nhận thanh toán');
    assert.equal(item.actor.kind, 'staff');
    assert.equal(item.actor.displayName, 'Quản trị viên Trang');
    assert.ok(item.description?.includes('200.000'));
  });

  it('maps order_held to staff display name / Đã tạm giữ đơn with reason', () => {
    const item = mapOrderActivityItem(
      {
        id: 'event-4',
        event_type: 'order_held',
        actor_user_id: 'staff-editor-2',
        actor_role: 'editor',
        payload: { reason: 'Khách yêu cầu đổi địa chỉ' },
        created_at: '2026-09-30T10:15:00Z',
      },
      staffMap
    );

    assert.equal(item.eventType, 'order_held');
    assert.equal(item.title, 'Đã tạm giữ đơn');
    assert.equal(item.actor.kind, 'staff');
    assert.equal(item.actor.displayName, 'Biên tập viên Minh');
    assert.equal(item.description, 'Lý do: Khách yêu cầu đổi địa chỉ');
  });

  it('maps order_hold_released to staff display name / Đã bỏ tạm giữ', () => {
    const item = mapOrderActivityItem(
      {
        id: 'event-5',
        event_type: 'order_hold_released',
        actor_user_id: 'staff-admin-1',
        actor_role: 'admin',
        created_at: '2026-09-30T10:20:00Z',
      },
      staffMap
    );

    assert.equal(item.eventType, 'order_hold_released');
    assert.equal(item.title, 'Đã bỏ tạm giữ');
    assert.equal(item.actor.kind, 'staff');
    assert.equal(item.actor.displayName, 'Quản trị viên Trang');
  });

  it('maps unknown event to generic title without leaking raw payload or UUID', () => {
    const item = mapOrderActivityItem({
      id: 'event-6',
      event_type: 'custom_warehouse_scanned',
      actor_role: 'staff',
      payload: { internal_id: 'raw-secret-123', description: 'Đã quét mã tại kho' },
      created_at: '2026-09-30T10:25:00Z',
    });

    assert.equal(item.title, 'Cập nhật đơn hàng');
    assert.equal(item.description, 'Đã quét mã tại kho');
    assert.equal(item.actor.kind, 'staff');
    assert.equal(item.actor.displayName, 'Nhân viên');
  });
});

describe('OrderEventRepository.listForOrder', () => {
  const staff: StaffIdentity = {
    userId: 'staff-1',
    role: 'admin',
  };

  it('denies non-staff callers', async () => {
    const fakeClient = {} as SupabaseClient;
    const repo = new OrderEventRepository(fakeClient);

    await assert.rejects(
      () => repo.listForOrder('order-1', { userId: 'cust-1', role: 'none' as unknown as StaffIdentity['role'] }, { limit: 20 }),
      /Unauthorized/
    );
  });

  it('lists newest-first events and computes next cursor', async () => {
    const mockEvents = [
      {
        id: 'ev-2',
        event_type: 'payment_confirmed',
        order_id: 'order-1',
        actor_user_id: 'staff-1',
        actor_role: 'admin',
        payload: { amount: 150000 },
        created_at: '2026-09-30T11:00:00Z',
      },
      {
        id: 'ev-1',
        event_type: 'order_created',
        order_id: 'order-1',
        actor_role: 'customer',
        payload: {},
        created_at: '2026-09-30T10:00:00Z',
      },
    ];

    const fakeClient = {
      from(table: string) {
        if (table === 'order_events') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return Promise.resolve({ data: mockEvents, error: null });
            },
          };
        }
        if (table === 'staff_roles') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ user_id: 'staff-1', display_name: 'Admin Trang', role: 'admin' }],
                error: null,
              });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const repo = new OrderEventRepository(fakeClient);
    const result = await repo.listForOrder('order-1', staff, { limit: 1 });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, 'ev-2');
    assert.equal(result.items[0].actor.displayName, 'Admin Trang');
    assert.ok(result.nextCursor);
  });
});
