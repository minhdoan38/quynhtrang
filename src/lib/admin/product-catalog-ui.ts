import type { CommercialDraft } from '../domain/catalog.ts';
import { calculatePrice, type CommercialConfigVersion, type CatalogStatus } from '../domain/commercial-config.ts';
import type { AdminProduct } from '../repositories/admin-catalog-repository.ts';
import { toSafeOperationError } from '../reliability/error-contract.ts';

export type CatalogActionResult<T> =
  | { ok: true; value: T }
  | {
    ok: false;
    code: string;
    status: number;
    message: string;
    operationId?: string;
    retryable?: boolean;
  };

export const CATALOG_STATUS_LABEL: Record<CatalogStatus, string> = { active: 'Đang bán', draft: 'Bản nháp', archived: 'Đã lưu trữ' };
export const CATALOG_STATUS_BADGE: Record<CatalogStatus, 'sage' | 'honey' | 'slate'> = { active: 'sage', draft: 'honey', archived: 'slate' };

export function catalogActionError(error: unknown): CatalogActionResult<never> {
  const safe = toSafeOperationError(error, {
    operation: 'catalogAction',
    defaultMessage: 'Chưa thể áp dụng giá mới.',
  });
  const code = error instanceof Error ? error.message.split(':')[0] : 'INTERNAL_ERROR';
  const messages: Record<string, string> = {
    FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
    UNAUTHENTICATED: 'Vui lòng đăng nhập lại.',
    REVISION_CONFLICT: 'Cấu hình đã thay đổi ở tab khác. Tải lại trước khi chỉnh sửa tiếp.',
    NOT_FOUND: 'Không tìm thấy sản phẩm hoặc bản nháp. Vui lòng tải lại.',
    INVALID_INPUT: 'Thông tin chưa hợp lệ. Kiểm tra các trường đã nhập.',
    COMMERCIAL_CONFIG_INVALID: 'Bảng giá chưa hợp lệ.',
    MISSING_COMMERCIAL_CONFIG: 'Sản phẩm chưa đủ điều kiện để đưa vào bán.',
    NO_ACTIVE_VARIANTS: 'Sản phẩm chưa đủ điều kiện để đưa vào bán.',
    MISSING_DEFINITION_KEY: 'Biến thể chưa có định nghĩa kỹ thuật được hỗ trợ.',
    UNKNOWN_DEFINITION_KEY: 'Biến thể không thuộc danh mục được hỗ trợ.',
    LAST_ACTIVE_VARIANT: 'Cần lưu trữ sản phẩm trước khi lưu trữ variant đang bán cuối cùng.',
    ALREADY_CONFIGURED: 'Variant đã được cấu hình. Vui lòng tải lại.',
    CATALOG_READ_FAILED: 'Chưa thể tải cấu hình sản phẩm.',
  };
  const known = Object.hasOwn(messages, code);
  const status =
    code === 'FORBIDDEN' ? 403 :
      code === 'UNAUTHENTICATED' ? 401 :
        code === 'REVISION_CONFLICT' ? 409 :
          known ? 400 : 500;
  const message = known ? messages[code] : safe.userMessage;

  return {
    ok: false,
    code: known ? code : (safe.code === 'UNEXPECTED_ERROR' ? 'INTERNAL_ERROR' : safe.code),
    status,
    message,
    operationId: safe.operationId,
    retryable: safe.retryable,
  };
}

export function commercialDraftConfig(draft: CommercialDraft): CommercialConfigVersion {
  return { ...draft.payload, id: draft.id, productId: draft.productId, versionNumber: Math.max(1, draft.payload.versionNumber ?? 1) };
}

export function catalogStartingPrice(product: AdminProduct, variantId?: string): number | null {
  const config = product.currentConfig;
  if (!config) return null;
  let price: number | null = null;
  for (const variant of product.variants) {
    if (variantId ? variant.id !== variantId : variant.status !== 'active') continue;
    const rule = config.variantRules.find((item) => item.variantId === variant.id);
    if (!rule) continue;
    for (const tier of rule.tiers) {
      try {
        const quote = calculatePrice(config, variant.id, tier.minimumQuantity);
        price = price === null ? quote.unitPrice : Math.min(price, quote.unitPrice);
      } catch { /* Invalid published rules are not advertised as prices. */ }
    }
  }
  return price;
}
