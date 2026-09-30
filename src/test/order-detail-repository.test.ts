import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderRepository } from '../lib/repositories/order-repository.ts';
import { DesignVersionRepository } from '../lib/repositories/design-version-repository.ts';
import type { StaffIdentity } from '../lib/domain/order.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('OrderRepository.getOrderDetail', () => {
  const adminStaff: StaffIdentity = {
    userId: 'staff-admin-1',
    role: 'admin',
  };


  it('rejects unauthorized non-staff callers', async () => {
    const fakeClient = {} as SupabaseClient;
    const repo = new OrderRepository(fakeClient);

    await assert.rejects(
      () => repo.getOrderDetail('order-1', { userId: 'cust-1', role: 'none' as unknown as StaffIdentity['role'] }),
      /Valid staff identity required/
    );
  });

  it('maps complete order detail with active hold and resolved next action', async () => {
    const mockOrder = {
      id: 'order-1042',
      public_order_code: 'QT1042',
      created_at: '2026-09-30T09:00:00Z',
      updated_at: '2026-09-30T10:00:00Z',
      payment_status: 'payment_reported',
      design_status: 'awaiting_review',
      fulfillment_status: 'unprocessed',
      quantity: 2,
      unit_price: 100000,
      subtotal: 200000,
      total: 200000,
      currency: 'VND',
      customer_full_name: 'Nguyễn Văn A',
      customer_phone: '0901234567',
      shipping_address: '123 Đường Lê Lợi, Q1, TP.HCM',
      product_snapshot: { name: 'Thiệp cưới cao cấp', configuration: [{ label: 'Khổ', value: 'A5' }] },
      variant_snapshot: { name: 'Giấy mỹ thuật' },
      order_payments: [
        {
          id: 'pay-1',
          status: 'payment_reported',
          amount: 200000,
          currency: 'VND',
          reference: 'QT1042',
          customer_reported_at: '2026-09-30T09:30:00Z',
          confirmed_at: null,
          confirmed_by: null,
        },
      ],
      design_versions: [
        {
          id: 'dv-1',
          version_number: 1,
          source: 'customer_approved',
          approved_thumbnail_path: 'approved-renders/preview-1.png',
          preflight_snapshot: {
            level: 'pass',
            passCount: 5,
            warningCount: 0,
            errorCount: 0,
            acceptedWarningCount: 0,
            checks: [],
          },
          created_at: '2026-09-30T08:50:00Z',
        },
      ],
      order_holds: [
        {
          id: 'hold-1',
          reason: 'Khách đổi địa chỉ giao hàng',
          held_by: 'staff-admin-1',
          held_at: '2026-09-30T09:45:00Z',
          released_at: null,
        },
      ],
    };

    const mockEvents = [
      {
        id: 'ev-2',
        event_type: 'order_held',
        actor_user_id: 'staff-admin-1',
        actor_role: 'admin',
        payload: { reason: 'Khách đổi địa chỉ giao hàng' },
        created_at: '2026-09-30T09:45:00Z',
      },
      {
        id: 'ev-1',
        event_type: 'customer_payment_reported',
        actor_role: 'customer',
        payload: { ref: 'QT1042' },
        created_at: '2026-09-30T09:30:00Z',
      },
    ];

    const fakeClient = {
      from(table: string) {
        if (table === 'orders') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: mockOrder, error: null });
            },
          };
        }
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
                data: [{ user_id: 'staff-admin-1', display_name: 'Quản trị viên Trang', role: 'admin' }],
                error: null,
              });
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      storage: {
        from(bucket: string) {
          return {
            createSignedUrl(path: string) {
              return Promise.resolve({ data: { signedUrl: `https://storage.local/${bucket}/${path}?signed=1` }, error: null });
            },
          };
        },
      },
    } as unknown as SupabaseClient;

    const repo = new OrderRepository(fakeClient);
    const detail = await repo.getOrderDetail('order-1042', adminStaff);

    assert.ok(detail);
    assert.equal(detail.id, 'order-1042');
    assert.equal(detail.publicOrderCode, 'QT1042');
    assert.equal(detail.paymentStatus, 'payment_reported');

    // Payment mapping
    assert.equal(detail.payment.amount, 200000);
    assert.equal(detail.payment.status, 'payment_reported');
    assert.equal(detail.payment.customerReportedAt, '2026-09-30T09:30:00Z');

    // Approved design mapping
    assert.equal(detail.approvedDesign.label, 'Phiên bản khách duyệt v1');
    assert.equal(detail.approvedDesign.preflight.level, 'pass');
    assert.ok(detail.approvedDesign.thumbnailUrl?.includes('preview-1.png'));

    // Active hold
    assert.ok(detail.activeHold);
    assert.equal(detail.activeHold?.reason, 'Khách đổi địa chỉ giao hàng');
    assert.equal(detail.activeHold?.heldBy.displayName, 'Quản trị viên Trang');

    // Next action: Hold overrides payment report
    assert.equal(detail.nextAction.kind, 'release_hold');
    assert.equal(detail.nextAction.eyebrow, 'CẦN XỬ LÝ');

    // Product & Customer
    assert.equal(detail.product.name, 'Thiệp cưới cao cấp');
    assert.equal(detail.product.quantity, 2);
    assert.equal(detail.customer.fullName, 'Nguyễn Văn A');
    assert.equal(detail.delivery.shippingAddress, '123 Đường Lê Lợi, Q1, TP.HCM');

    // Events
    assert.equal(detail.recentEvents.length, 2);
    assert.equal(detail.recentEvents[0].title, 'Đã tạm giữ đơn');
    assert.equal(detail.recentEvents[0].actor.displayName, 'Quản trị viên Trang');
  });
});

describe('DesignVersionRepository.getApprovedDesignForStaff', () => {
  const staff: StaffIdentity = {
    userId: 'staff-editor-1',
    role: 'editor',
  };

  it('denies non-staff callers', async () => {
    const fakeClient = {} as SupabaseClient;
    const repo = new DesignVersionRepository(fakeClient);
    const result = await repo.getApprovedDesignForStaff('order-1', { userId: 'cust-1', role: 'none' as unknown as StaffIdentity['role'] });
    assert.equal(result, null);
  });

  it('loads full designDocument and preflight summary for approved design version', async () => {
    const mockOrder = {
      id: 'order-1',
      public_order_code: 'QT1042',
      approved_design_version_id: 'dv-approved-1',
    };

    const mockVersion = {
      id: 'dv-approved-1',
      version_number: 1,
      source: 'customer_approved',
      design_document: {
        text: 'Hello World',
        backgroundColor: '#FFFFFF',
      },
      preflight_snapshot: {
        level: 'warning',
        passCount: 4,
        warningCount: 1,
        errorCount: 0,
        acceptedWarningCount: 1,
        checks: [
          {
            id: 'safe-area',
            level: 'warning',
            category: 'safe-area',
            label: 'Sát mép',
            description: 'Dưới 3mm',
            advice: 'Lùi vào trong',
          },
        ],
      },
    };

    const fakeClient = {
      from(table: string) {
        if (table === 'orders') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: mockOrder, error: null });
            },
          };
        }
        if (table === 'design_versions') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: mockVersion, error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const repo = new DesignVersionRepository(fakeClient);
    const result = await repo.getApprovedDesignForStaff('order-1', staff);

    assert.ok(result);
    assert.equal(result.orderId, 'order-1');
    assert.equal(result.publicOrderCode, 'QT1042');
    assert.equal(result.versionId, 'dv-approved-1');
    assert.deepEqual(result.designDocument, { text: 'Hello World', backgroundColor: '#FFFFFF' });
    assert.equal(result.preflight.level, 'warning');
    assert.equal(result.preflight.checks.length, 1);
  });
});
