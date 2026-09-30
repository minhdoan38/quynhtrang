import type {
  OrderNextAction,
  OrderOperationalState,
} from '../domain/order.ts';

export function resolveOrderNextAction(state: OrderOperationalState): OrderNextAction {
  // 1. Active hold → release_hold, regardless of other states.
  if (state.activeHold) {
    return {
      kind: 'release_hold',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Đang tạm giữ đơn',
      description: state.activeHold.reason
        ? `Lý do: ${state.activeHold.reason}`
        : 'Đơn hàng đang bị tạm giữ xử lý',
      intent: 'attention',
      cta: {
        label: 'Bỏ tạm giữ',
        type: 'release_hold',
      },
    };
  }

  // 2. cancelled → none (Đơn đã hủy)
  if (state.fulfillmentStatus === 'cancelled' || state.paymentStatus === 'cancelled') {
    return {
      kind: 'none',
      eyebrow: 'TRẠNG THÁI',
      title: 'Đơn đã hủy',
      description: 'Đơn hàng đã bị hủy, không thể tiếp tục xử lý.',
      intent: 'neutral',
      cta: null,
    };
  }

  // 3. completed → none (Đơn đã hoàn tất)
  if (state.fulfillmentStatus === 'completed') {
    return {
      kind: 'none',
      eyebrow: 'TRẠNG THÁI',
      title: 'Đơn đã hoàn tất',
      description: 'Đơn hàng đã được sản xuất và giao hoàn tất.',
      intent: 'neutral',
      cta: null,
    };
  }

  // 4. payment_reported → verify_payment (Khách báo đã chuyển khoản)
  if (state.paymentStatus === 'payment_reported') {
    return {
      kind: 'verify_payment',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Khách báo đã chuyển khoản',
      description: 'Kiểm tra tài khoản và xác nhận thanh toán để tiếp tục xử lý đơn.',
      intent: 'attention',
      cta: {
        label: 'Xác nhận thanh toán',
        type: 'confirm_payment',
      },
    };
  }

  // 5. pending_payment → wait_for_payment (Đang chờ khách thanh toán)
  if (state.paymentStatus === 'pending_payment') {
    return {
      kind: 'wait_for_payment',
      eyebrow: 'ĐANG CHỜ',
      title: 'Đang chờ khách thanh toán',
      description: 'Chờ khách hoàn tất thanh toán chuyển khoản trước khi chuyển qua duyệt thiết kế.',
      intent: 'waiting',
      cta: null,
    };
  }

  // 6. paid + in_production → production_in_progress
  if (state.paymentStatus === 'paid' && state.fulfillmentStatus === 'in_production') {
    return {
      kind: 'production_in_progress',
      eyebrow: 'TRẠNG THÁI',
      title: 'Đang sản xuất',
      description: 'Đơn hàng đang trong quá trình in ấn và gia công.',
      intent: 'neutral',
      cta: null,
    };
  }

  // 7. paid + design awaiting_review or ready → review_design
  if (state.paymentStatus === 'paid' && (state.designStatus === 'awaiting_review' || state.designStatus === 'ready')) {
    return {
      kind: 'review_design',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Cần duyệt thiết kế',
      description: 'Khách đã thanh toán. Kiểm tra và duyệt file in của đơn hàng.',
      intent: 'attention',
      cta: {
        label: 'Kiểm tra thiết kế',
        type: 'navigate',
      },
    };
  }

  // 8. paid + design needs_changes or editing → resolve_design_changes
  if (state.paymentStatus === 'paid' && (state.designStatus === 'needs_changes' || state.designStatus === 'editing')) {
    return {
      kind: 'resolve_design_changes',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Cần chỉnh sửa thiết kế',
      description: 'File thiết kế cần được điều chỉnh hoặc đang được cập nhật.',
      intent: 'attention',
      cta: {
        label: 'Kiểm tra thiết kế',
        type: 'navigate',
      },
    };
  }

  // 9. paid + design approved + fulfillment unprocessed or ready_for_production → ready_for_production
  if (
    state.paymentStatus === 'paid' &&
    state.designStatus === 'approved' &&
    (state.fulfillmentStatus === 'unprocessed' || state.fulfillmentStatus === 'ready_for_production')
  ) {
    return {
      kind: 'ready_for_production',
      eyebrow: 'SẴN SÀNG',
      title: 'Sẵn sàng sản xuất',
      description: 'Đã nhận thanh toán và thiết kế đã duyệt. Sẵn sàng đưa vào xưởng in.',
      intent: 'ready',
      cta: null,
    };
  }

  // 10. Any invalid/unrecognized combination → neutral none titled Kiểm tra trạng thái đơn
  return {
    kind: 'none',
    eyebrow: 'TRẠNG THÁI',
    title: 'Kiểm tra trạng thái đơn',
    description: 'Không có hành động tự động nào phù hợp với trạng thái hiện tại.',
    intent: 'neutral',
    cta: null,
  };
}
