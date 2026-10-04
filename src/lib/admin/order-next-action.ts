import type {
  OrderNextAction,
  OrderOperationalState,
} from '../domain/order.ts';
import { isPaymentSatisfiedForProduction } from '../domain/payment-presentation.ts';
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

  const isDeposit = state.paymentPolicy?.kind === 'fixed_deposit' ||
    state.paymentPurpose === 'checkout_deposit' ||
    state.paymentStatus === 'deposit_confirmed';

  // 4. payment_reported → verify_payment (Khách báo đã chuyển khoản)
  if (state.paymentStatus === 'payment_reported') {
    return {
      kind: 'verify_payment',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Khách báo đã chuyển khoản',
      description: isDeposit
        ? 'Kiểm tra tài khoản và xác nhận tiền cọc để tiếp tục xử lý đơn.'
        : 'Kiểm tra tài khoản và xác nhận thanh toán để tiếp tục xử lý đơn.',
      intent: 'attention',
      cta: {
        label: isDeposit ? 'Xác nhận cọc' : 'Xác nhận thanh toán',
        type: 'confirm_payment',
      },
    };
  }

  // 5. pending_payment → wait_for_payment (Đang chờ khách thanh toán)
  if (state.paymentStatus === 'pending_payment') {
    return {
      kind: 'wait_for_payment',
      eyebrow: 'ĐANG CHỜ',
      title: isDeposit ? 'Đang chờ khách đặt cọc' : 'Đang chờ khách thanh toán',
      description: isDeposit
        ? 'Chờ khách hoàn tất đặt cọc chuyển khoản trước khi chuyển qua duyệt thiết kế.'
        : 'Chờ khách hoàn tất thanh toán chuyển khoản trước khi chuyển qua duyệt thiết kế.',
      intent: 'waiting',
      cta: null,
    };
  }

  const isPaidSatisfied = isPaymentSatisfiedForProduction(state);

  // 6. payment satisfied + in_production → production_in_progress
  if (isPaidSatisfied && state.fulfillmentStatus === 'in_production') {
    return {
      kind: 'production_in_progress',
      eyebrow: 'TRẠNG THÁI',
      title: 'Đang sản xuất',
      description: 'Đơn hàng đang trong quá trình in ấn và gia công.',
      intent: 'neutral',
      cta: {
        label: 'Hoàn tất sản xuất',
        type: 'complete_production',
      },
    };
  }

  // 7. payment satisfied + design awaiting_review or ready → review_design
  if (isPaidSatisfied && (state.designStatus === 'awaiting_review' || state.designStatus === 'ready')) {
    return {
      kind: 'review_design',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Cần duyệt thiết kế',
      description: isDeposit
        ? 'Đã xác nhận cọc. Kiểm tra và duyệt file in của đơn hàng.'
        : 'Khách đã thanh toán. Kiểm tra và duyệt file in của đơn hàng.',
      intent: 'attention',
      cta: {
        label: 'Kiểm tra thiết kế',
        type: 'navigate',
      },
    };
  }

  // 8. payment satisfied + design editing → continue_design_edit
  if (isPaidSatisfied && state.designStatus === 'editing') {
    return {
      kind: 'continue_design_edit',
      eyebrow: 'CẦN XỬ LÝ',
      title: 'Đang chỉnh sửa thiết kế',
      description: 'Đơn hàng đang có bản chỉnh sửa thiết kế dở dang.',
      intent: 'attention',
      cta: {
        label: 'Tiếp tục chỉnh sửa',
        type: 'navigate',
      },
    };
  }

  // 8b. payment satisfied + design needs_changes → resolve_design_changes
  if (isPaidSatisfied && state.designStatus === 'needs_changes') {
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

  // 9. payment satisfied + design approved + fulfillment unprocessed or ready_for_production → ready_for_production
  if (
    isPaidSatisfied &&
    state.designStatus === 'approved' &&
    (state.fulfillmentStatus === 'unprocessed' || state.fulfillmentStatus === 'ready_for_production')
  ) {
    return {
      kind: 'ready_for_production',
      eyebrow: 'SẴN SÀNG',
      title: 'Sẵn sàng sản xuất',
      description: isDeposit
        ? 'Đã xác nhận cọc và thiết kế đã duyệt. Sẵn sàng đưa vào xưởng in.'
        : 'Đã nhận thanh toán và thiết kế đã duyệt. Sẵn sàng đưa vào xưởng in.',
      intent: 'ready',
      cta: {
        label: 'Bắt đầu sản xuất',
        type: 'start_production',
      },
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
