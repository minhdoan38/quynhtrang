import { createOperationId } from './operation-id.ts';

export type ReliabilityErrorCode =
  | 'EXPECTED_VALIDATION_ERROR'
  | 'BUSINESS_CONFLICT'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'RETRYABLE_SERVER_ERROR'
  | 'NON_RETRYABLE_SERVER_ERROR'
  | 'CLIENT_PERSISTENCE_ERROR'
  | 'CONCURRENCY_CONFLICT'
  | 'UNKNOWN_OUTCOME'
  | 'UNEXPECTED_ERROR'
  | 'STALE_REVISION'
  | 'REVISION_CONFLICT'
  | 'PAYMENT_REQUIRED'
  | 'ORDER_ALREADY_CLAIMED'
  | 'LEASE_EXPIRED'
  | 'LEASE_LOST'
  | 'LEASE_CONFLICT'
  | 'ORDER_LOCKED'
  | 'PRODUCTION_CHANGED'
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'COMMERCIAL_CONFIG_INVALID'
  | 'INVALID_REASON'
  | 'STORAGE_FAILURE';

export type RetryPolicy = 'retryable' | 'refetchFirst' | 'unknownOutcome' | 'nonRetryable';

export type OperationSuccessResult<T> = {
  ok: true;
  value: T;
  operationId: string;
};

export type OperationErrorResult = {
  ok: false;
  code: ReliabilityErrorCode | string;
  safeMessageKey: string;
  userMessage: string;
  retryable: boolean;
  retryPolicy: RetryPolicy;
  operationId: string;
  currentState?: Record<string, unknown>;
};

export type OperationResult<T> = OperationSuccessResult<T> | OperationErrorResult;

const SENSITIVE_PATTERN =
  /syntax error|relation\s+"?\w+"?|column\s+"?\w+"?|insert into|select\s+.*from|pg_|42p01|pgrst|postgrest|customer-assets|approved-renders|\/storage\/v1|bearer\s+|service_role|eyJ[a-zA-Z0-9_-]+|\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b|\b0\d{9,10}\b|\bat\s+.*:\d+:\d+|c:\\|\/home\/|\/app\//i;

const NETWORK_ERROR_PATTERN =
  /fetch failed|socket hang up|network|timeout|timed out|aborted|econnreset|etimedout/i;

const SAFE_MESSAGES: Record<string, { key: string; message: string }> = {
  STALE_REVISION: {
    key: 'reliability.stale_revision',
    message: 'Thiết kế đã được cập nhật ở nơi khác. Hãy tải phiên bản mới nhất.',
  },
  REVISION_CONFLICT: {
    key: 'reliability.revision_conflict',
    message: 'Dữ liệu đã được cập nhật ở phiên làm việc khác. Hãy tải lại trang.',
  },
  LEASE_EXPIRED: {
    key: 'reliability.lease_expired',
    message: 'Phiên chỉnh sửa đã hết hạn. Hãy tải lại để tiếp tục.',
  },
  LEASE_LOST: {
    key: 'reliability.lease_lost',
    message: 'Phiên chỉnh sửa đã được mở ở nơi khác. Hãy tải lại trang.',
  },
  LEASE_CONFLICT: {
    key: 'reliability.lease_conflict',
    message: 'Phiên làm việc đang có xung đột. Hãy tải lại trang.',
  },
  PAYMENT_REQUIRED: {
    key: 'reliability.payment_required',
    message: 'Đơn hàng cần hoàn tất thanh toán trước khi tiếp tục.',
  },
  ORDER_ALREADY_CLAIMED: {
    key: 'reliability.order_already_claimed',
    message: 'Đơn hàng này đã được liên kết với một tài khoản khác.',
  },
  ORDER_LOCKED: {
    key: 'reliability.order_locked',
    message: 'Đơn hàng đang ở trạng thái khóa và không thể chỉnh sửa.',
  },
  PRODUCTION_CHANGED: {
    key: 'reliability.production_changed',
    message: 'Trạng thái sản xuất của đơn hàng đã thay đổi. Vui lòng làm mới trang.',
  },
  NOT_FOUND: {
    key: 'reliability.not_found',
    message: 'Không tìm thấy dữ liệu yêu cầu.',
  },
  UNAUTHENTICATED: {
    key: 'reliability.unauthenticated',
    message: 'Vui lòng đăng nhập để tiếp tục.',
  },
  FORBIDDEN: {
    key: 'reliability.forbidden',
    message: 'Bạn không có quyền thực hiện thao tác này.',
  },
  AUTHORIZATION_ERROR: {
    key: 'reliability.authorization_error',
    message: 'Bạn không có quyền thực hiện thao tác này.',
  },
  EXPECTED_VALIDATION_ERROR: {
    key: 'reliability.validation_error',
    message: 'Thông tin cung cấp chưa hợp lệ. Vui lòng kiểm tra lại.',
  },
  INVALID_INPUT: {
    key: 'reliability.invalid_input',
    message: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  },
  CLIENT_PERSISTENCE_ERROR: {
    key: 'reliability.client_persistence_error',
    message: 'Không thể lưu trữ dữ liệu trên thiết bị. Hãy kiểm tra bộ nhớ trình duyệt.',
  },
  CONCURRENCY_CONFLICT: {
    key: 'reliability.concurrency_conflict',
    message: 'Thao tác bị xung đột với phiên khác. Vui lòng tải lại và thử lại.',
  },
  BUSINESS_CONFLICT: {
    key: 'reliability.business_conflict',
    message: 'Trạng thái nghiệp vụ hiện tại không cho phép thực hiện thao tác.',
  },
  UNKNOWN_OUTCOME: {
    key: 'reliability.unknown_outcome',
    message: 'Kết quả thao tác chưa thể xác định. Vui lòng tải lại trang để kiểm tra trạng thái.',
  },
  NETWORK_ERROR: {
    key: 'reliability.network_error',
    message: 'Mất kết nối. Hãy kiểm tra mạng và thử lại.',
  },
  RETRYABLE_SERVER_ERROR: {
    key: 'reliability.server_error_retryable',
    message: 'Máy chủ đang bận. Vui lòng thử lại sau giây lát.',
  },
  NON_RETRYABLE_SERVER_ERROR: {
    key: 'reliability.server_error_non_retryable',
    message: 'Máy chủ gặp lỗi khi xử lý. Vui lòng liên hệ hỗ trợ nếu lỗi tiếp diễn.',
  },
  UNEXPECTED_ERROR: {
    key: 'reliability.unexpected_error',
    message: 'Không thể hoàn tất thao tác. Vui lòng thử lại sau.',
  },
};

export function classifyRetry(code: string, _operationKind?: string): RetryPolicy {
  switch (code) {
    case 'NETWORK_ERROR':
    case 'RETRYABLE_SERVER_ERROR':
    case 'TIMEOUT':
    case 'STORAGE_FAILURE':
      return 'retryable';

    case 'STALE_REVISION':
    case 'REVISION_CONFLICT':
    case 'LEASE_EXPIRED':
    case 'LEASE_LOST':
    case 'LEASE_CONFLICT':
    case 'CONCURRENCY_CONFLICT':
    case 'BUSINESS_CONFLICT':
    case 'STATE_CONFLICT':
    case 'PRODUCTION_CHANGED':
      return 'refetchFirst';

    case 'UNKNOWN_OUTCOME':
      return 'unknownOutcome';

    default:
      return 'nonRetryable';
  }
}

export function toSafeOperationError(
  error: unknown,
  context?: {
    operation?: string;
    operationId?: string;
    defaultMessage?: string;
  },
): OperationErrorResult {
  const opId = context?.operationId || createOperationId(context?.operation);
  const raw = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const rawMsg = error instanceof Error ? error.message : typeof raw?.message === 'string' ? raw.message : '';
  const rawCode = typeof raw?.code === 'string' ? raw.code.trim() : '';
  let code: string = 'UNEXPECTED_ERROR';
  if (rawCode && !SENSITIVE_PATTERN.test(rawCode) && !/^[0-9A-Z]{5}$/.test(rawCode)) {
    code = rawCode;
  } else if (/^[A-Z][A-Z0-9_]{2,49}$/.test(rawMsg) && !SENSITIVE_PATTERN.test(rawMsg) && !/^[0-9A-Z]{5}$/.test(rawMsg)) {
    code = rawMsg;
  } else if (error instanceof TypeError || NETWORK_ERROR_PATTERN.test(rawMsg)) {
    code = 'NETWORK_ERROR';
  }

  const retryPolicy = classifyRetry(code, context?.operation);
  const matched = SAFE_MESSAGES[code];
  const safeMessageKey = matched ? matched.key : `reliability.${code.toLowerCase()}`;

  let userMessage = matched?.message || SAFE_MESSAGES.UNEXPECTED_ERROR.message;
  if (
    context?.defaultMessage &&
    !SENSITIVE_PATTERN.test(context.defaultMessage) &&
    !NETWORK_ERROR_PATTERN.test(context.defaultMessage)
  ) {
    userMessage = context.defaultMessage;
  }

  let currentState: Record<string, unknown> | undefined;
  if (typeof raw?.current_revision === 'number') {
    currentState = { revision: raw.current_revision };
  } else if (raw?.currentState && typeof raw.currentState === 'object') {
    currentState = raw.currentState as Record<string, unknown>;
  }

  return {
    ok: false,
    code,
    safeMessageKey,
    userMessage,
    retryable: retryPolicy === 'retryable',
    retryPolicy,
    operationId: opId,
    ...(currentState ? { currentState } : {}),
  };
}
