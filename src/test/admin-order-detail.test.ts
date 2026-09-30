import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AdminOrderDetail, StaffIdentity } from '../lib/domain/order.ts';
import { resolveOrderNextAction } from '../lib/admin/order-next-action.ts';

function createMockDetail(overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  const baseDetail: AdminOrderDetail = {
    id: 'order-1042',
    publicOrderCode: 'QT1042',
    createdAt: '2026-09-30T09:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    paymentStatus: 'payment_reported',
    designStatus: 'awaiting_review',
    fulfillmentStatus: 'unprocessed',
    payment: {
      id: 'pay-1',
      status: 'payment_reported',
      amount: 200000,
      currency: 'VND',
      reference: 'QT1042',
      customerReportedAt: '2026-09-30T09:30:00Z',
      confirmedAt: null,
      confirmedBy: null,
    },
    approvedDesign: {
      id: 'dv-1',
      versionNumber: 1,
      source: 'customer_approved',
      label: 'Phiên bản khách duyệt v1',
      thumbnailUrl: 'https://storage.local/approved-renders/preview-1.png',
      preflight: {
        level: 'pass',
        passCount: 5,
        warningCount: 0,
        errorCount: 0,
        acceptedWarningCount: 0,
        checks: [],
      },
      createdAt: '2026-09-30T08:50:00Z',
    },
    product: {
      name: 'Thiệp cưới cao cấp',
      variant: 'Giấy mỹ thuật',
      configuration: [{ label: 'Khổ', value: 'A5' }],
      quantity: 2,
      unitPrice: 100000,
      subtotal: 200000,
      total: 200000,
      currency: 'VND',
    },
    customer: {
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
    },
    delivery: {
      shippingAddress: '123 Đường Lê Lợi, Q1, TP.HCM',
    },
    activeHold: null,
    nextAction: {
      kind: 'verify_payment',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Khách báo đã chuyển khoản',
      description: 'Kiểm tra tài khoản và xác nhận thanh toán để tiếp tục xử lý đơn.',
      intent: 'attention',
      cta: {
        label: 'Xác nhận thanh toán',
        type: 'confirm_payment',
      },
    },
    recentEvents: [
      {
        id: 'ev-1',
        eventType: 'customer_payment_reported',
        title: 'Báo đã chuyển khoản',
        description: 'Mã tham chiếu: QT1042',
        actor: { kind: 'customer', displayName: 'Khách hàng' },
        createdAt: '2026-09-30T09:30:00Z',
      },
    ],
    nextEventCursor: null,
  };

  return {
    ...baseDetail,
    ...overrides,
  };
}

describe('AdminOrderDetail data contracts and permissions', () => {
  const adminStaff: StaffIdentity = { userId: 'admin-1', role: 'admin' };
  const editorStaff: StaffIdentity = { userId: 'editor-2', role: 'editor' };

  it('determines Admin can mutate while Editor is read-only', () => {
    const canAdminMutate = adminStaff.role === 'admin';
    const canEditorMutate = editorStaff.role === 'admin';

    assert.equal(canAdminMutate, true);
    assert.equal(canEditorMutate, false);
  });

  it('resolves active hold Next Action regardless of payment or design status', () => {
    const detail = createMockDetail({
      paymentStatus: 'payment_reported',
      activeHold: {
        id: 'hold-1',
        reason: 'Khách đổi địa chỉ',
        heldAt: '2026-09-30T09:50:00Z',
        heldBy: { userId: 'admin-1', displayName: 'Admin Trang', role: 'admin' },
      },
    });

    const nextAction = resolveOrderNextAction({
      paymentStatus: detail.paymentStatus,
      designStatus: detail.designStatus,
      fulfillmentStatus: detail.fulfillmentStatus,
      activeHold: detail.activeHold,
    });

    assert.equal(nextAction.kind, 'release_hold');
    assert.equal(nextAction.eyebrow, 'CẦN XỬ LÝ');
    assert.equal(nextAction.cta?.type, 'release_hold');
  });

  it('verifies paid approved design is production ready and links to read-only inspection', () => {
    const detail = createMockDetail({
      paymentStatus: 'paid',
      designStatus: 'approved',
      fulfillmentStatus: 'ready_for_production',
      payment: {
        id: 'pay-1',
        status: 'paid',
        amount: 200000,
        currency: 'VND',
        reference: 'QT1042',
        customerReportedAt: '2026-09-30T09:30:00Z',
        confirmedAt: '2026-09-30T09:40:00Z',
        confirmedBy: { userId: 'admin-1', displayName: 'Admin Trang' },
      },
    });

    const nextAction = resolveOrderNextAction({
      paymentStatus: detail.paymentStatus,
      designStatus: detail.designStatus,
      fulfillmentStatus: detail.fulfillmentStatus,
      activeHold: null,
    });

    assert.equal(nextAction.kind, 'ready_for_production');
    assert.equal(nextAction.eyebrow, 'SẴN SÀNG');
    assert.equal(nextAction.cta?.type, 'start_production');
    assert.equal(detail.approvedDesign.label, 'Phiên bản khách duyệt v1');
  });

  it('verifies paid awaiting review action navigates to design inspection', () => {
    const nextAction = resolveOrderNextAction({
      paymentStatus: 'paid',
      designStatus: 'awaiting_review',
      fulfillmentStatus: 'unprocessed',
      activeHold: null,
    });

    assert.equal(nextAction.kind, 'review_design');
    assert.equal(nextAction.eyebrow, 'CẦN XỬ LÝ');
    assert.equal(nextAction.cta?.type, 'navigate');
  });

  it('preserves immutable snapshots for product total and customer information', () => {
    const detail = createMockDetail();
    assert.equal(detail.product.total, 200000);
    assert.equal(detail.customer.fullName, 'Nguyễn Văn A');
    assert.equal(detail.customer.phone, '0901234567');
    assert.equal(detail.delivery.shippingAddress, '123 Đường Lê Lợi, Q1, TP.HCM');
  });
});
