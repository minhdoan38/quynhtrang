import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClaimResult {
  success: boolean;
  idempotent: boolean;
  orderId: string;
  projectId: string | null;
}

export class CustomerOrderClaimService {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async claimGuestOrder(orderId: string, guestToken: string): Promise<ClaimResult> {
    const cleanOrderId = orderId?.trim();
    if (!cleanOrderId) {
      throw new Error('Mã đơn hàng không hợp lệ');
    }

    const cleanToken = guestToken?.trim();
    if (!cleanToken) {
      throw new Error('Mã bảo mật phiên khách không hợp lệ');
    }

    const { data, error } = await this.client.rpc('claim_guest_order_and_project', {
      p_order_id: cleanOrderId,
      p_guest_token: cleanToken,
    });

    if (error) {
      const msg = error.message;
      if (msg.includes('UNAUTHENTICATED')) {
        throw new Error('Vui lòng đăng nhập để lưu đơn hàng vào tài khoản');
      }
      if (msg.includes('INVALID_GUEST_PROOF')) {
        throw new Error('Phiên truy cập đơn hàng đã hết hạn hoặc không hợp lệ');
      }
      if (msg.includes('ORDER_ALREADY_CLAIMED')) {
        throw new Error('Đơn hàng này đã được liên kết với một tài khoản khác');
      }
      if (msg.includes('ORDER_NOT_FOUND')) {
        throw new Error('Không tìm thấy thông tin đơn hàng');
      }
      throw new Error(msg || 'Không thể liên kết đơn hàng vào tài khoản');
    }

    const res = data as {
      success: boolean;
      idempotent?: boolean;
      order_id: string;
      project_id?: string | null;
      error?: string;
      message?: string;
    };

    if (!res.success) {
      const err = res.error || '';
      if (err.includes('UNAUTHENTICATED')) {
        throw new Error('Vui lòng đăng nhập để lưu đơn hàng vào tài khoản');
      }
      if (err.includes('INVALID_GUEST_PROOF')) {
        throw new Error('Phiên truy cập đơn hàng đã hết hạn hoặc không hợp lệ');
      }
      if (err.includes('ORDER_ALREADY_CLAIMED')) {
        throw new Error('Đơn hàng này đã được liên kết với một tài khoản khác');
      }
      throw new Error(res.message || 'Không thể liên kết đơn hàng');
    }

    return {
      success: true,
      idempotent: Boolean(res.idempotent),
      orderId: res.order_id,
      projectId: res.project_id ?? null,
    };
  }
}
