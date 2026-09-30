import type { PaymentInstructions } from './order-types.ts';
import { serverOrderStore } from './server-order-store.ts';

export interface BankAccountDetails {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export const DEFAULT_BANK_DETAILS: Readonly<BankAccountDetails> = Object.freeze({
  bankName: 'MB Bank (Ngân hàng Quân Đội)',
  bankCode: 'MB',
  accountNumber: '0912345678',
  accountName: 'TIEM IN QUYNH TRANG',
});

export interface PaymentQrProvider {
  name: string;
  generateInstructions(orderId: string): Promise<PaymentInstructions>;
}

export class DemoVietQrProvider implements PaymentQrProvider {
  name = 'vietqr-demo';

  async generateInstructions(orderId: string): Promise<PaymentInstructions> {
    const order = serverOrderStore.getOrder(orderId);
    if (!order) {
      throw new Error(`Không tìm thấy đơn hàng #${orderId}`);
    }

    const amount = order.payment?.amount ?? 0;
    const paymentReference = order.payment?.paymentReference ?? orderId;

    // Standard VietQR Quicklink specification for banking apps
    const encodedAccountName = encodeURIComponent(DEFAULT_BANK_DETAILS.accountName);
    const encodedReference = encodeURIComponent(paymentReference);
    const qrUrl = `https://img.vietqr.io/image/${DEFAULT_BANK_DETAILS.bankCode}-${DEFAULT_BANK_DETAILS.accountNumber}-compact2.png?amount=${amount}&addInfo=${encodedReference}&accountName=${encodedAccountName}`;

    // Text payload representing EMVCo/VietQR transfer content
    const qrPayload = `00020101021238540010A000000727012400069704220110${DEFAULT_BANK_DETAILS.accountNumber}520460115303704540${amount.toString().length}${amount}5802VN62${paymentReference.length + 4}080${paymentReference.length}${paymentReference}6304`;

    return {
      orderId,
      provider: this.name,
      bankName: DEFAULT_BANK_DETAILS.bankName,
      accountNumber: DEFAULT_BANK_DETAILS.accountNumber,
      accountName: DEFAULT_BANK_DETAILS.accountName,
      amount,
      currency: 'VND',
      paymentReference,
      qrPayload,
      qrUrl,
    };
  }
}

const defaultProvider: PaymentQrProvider = new DemoVietQrProvider();

export async function getPaymentInstructions(
  orderId: string,
  provider: PaymentQrProvider = defaultProvider
): Promise<PaymentInstructions> {
  return provider.generateInstructions(orderId);
}
