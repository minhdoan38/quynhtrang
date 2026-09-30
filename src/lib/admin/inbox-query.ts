import type {
  DesignStatus,
  FulfillmentStatus,
  InboxCounts,
  OrderInboxRow,
  OrderListQuery,
  PaymentStatus,
} from '../domain/order.ts';
import type { ProductId } from '../product-state.ts';

export interface InboxQueryParams {
  view: 'attention' | 'payment' | 'production' | 'all';
  q: string;
  payment?: PaymentStatus;
  processing?: DesignStatus | FulfillmentStatus;
  product?: ProductId;
  date?: 'today' | '7d' | '30d';
  page: number;
  pageSize: number;
}

export interface InboxResponse {
  rows: OrderInboxRow[];
  counts: InboxCounts;
  page: number;
  pageSize: number;
  total: number;
}

const VALID_VIEWS: Record<InboxQueryParams['view'], true> = {
  attention: true,
  payment: true,
  production: true,
  all: true,
};

const VALID_PAYMENTS: Record<PaymentStatus, true> = {
  pending_payment: true,
  payment_reported: true,
  paid: true,
  payment_failed: true,
  cancelled: true,
};

const DESIGN_STATUSES: Record<DesignStatus, true> = {
  awaiting_review: true,
  ready: true,
  editing: true,
  approved: true,
  needs_changes: true,
};

const FULFILLMENT_STATUSES: Record<FulfillmentStatus, true> = {
  unprocessed: true,
  ready_for_production: true,
  in_production: true,
  completed: true,
  cancelled: true,
};

const VALID_PRODUCTS: Record<ProductId, true> = {
  wrapping: true,
  card: true,
  sticker: true,
  notebook: true,
};

const VALID_DATES: Record<NonNullable<InboxQueryParams['date']>, true> = {
  today: true,
  '7d': true,
  '30d': true,
};

function getFirstParam(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  if (source instanceof URLSearchParams) {
    const val = source.get(key);
    return val !== null ? val : undefined;
  }
  const val = source[key];
  if (Array.isArray(val)) {
    return val[0];
  }
  return typeof val === 'string' ? val : undefined;
}

export function normalizeSearchTerm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\+?[\d\s().-]+$/.test(trimmed)) {
    let digits = trimmed.replace(/[\s().-]/g, '');
    if (digits.startsWith('+84')) {
      digits = '0' + digits.slice(3);
    } else if (digits.startsWith('84') && digits.length >= 10) {
      digits = '0' + digits.slice(2);
    }
    if (/^\d{7,15}$/.test(digits)) {
      return digits;
    }
  }

  return trimmed.toLowerCase();
}

export function parseInboxQueryParams(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>
): InboxQueryParams {
  const rawView = getFirstParam(searchParams, 'view');
  const view: InboxQueryParams['view'] =
    rawView && (VALID_VIEWS as Record<string, true>)[rawView]
      ? (rawView as InboxQueryParams['view'])
      : 'attention';

  const rawQ = getFirstParam(searchParams, 'q') ?? '';
  const q = normalizeSearchTerm(rawQ);

  const rawPayment = getFirstParam(searchParams, 'payment');
  const payment =
    rawPayment && (VALID_PAYMENTS as Record<string, true>)[rawPayment]
      ? (rawPayment as PaymentStatus)
      : undefined;

  const rawProcessing = getFirstParam(searchParams, 'processing');
  const processing =
    rawProcessing &&
      ((DESIGN_STATUSES as Record<string, true>)[rawProcessing] ||
        (FULFILLMENT_STATUSES as Record<string, true>)[rawProcessing])
      ? (rawProcessing as DesignStatus | FulfillmentStatus)
      : undefined;

  const rawProduct = getFirstParam(searchParams, 'product');
  const product =
    rawProduct && (VALID_PRODUCTS as Record<string, true>)[rawProduct]
      ? (rawProduct as ProductId)
      : undefined;

  const rawDate = getFirstParam(searchParams, 'date');
  const date =
    rawDate && (VALID_DATES as Record<string, true>)[rawDate]
      ? (rawDate as NonNullable<InboxQueryParams['date']>)
      : undefined;

  let page = 1;
  const rawPage = getFirstParam(searchParams, 'page');
  if (rawPage !== undefined && /^\d+$/.test(rawPage.trim())) {
    const parsedPage = Number(rawPage.trim());
    if (Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 100000) {
      page = parsedPage;
    }
  }

  let pageSize = 20;
  const rawPageSize = getFirstParam(searchParams, 'pageSize');
  if (rawPageSize !== undefined && rawPageSize.trim() !== '') {
    const parsedPageSize = Number(rawPageSize.trim());
    if (Number.isInteger(parsedPageSize)) {
      pageSize = Math.min(50, Math.max(10, parsedPageSize));
    }
  }

  const result: InboxQueryParams = {
    view,
    q,
    page,
    pageSize,
  };

  if (payment) result.payment = payment;
  if (processing) result.processing = processing;
  if (product) result.product = product;
  if (date) result.date = date;

  return result;
}

export function toOrderListQuery(
  params: InboxQueryParams,
  now: Date = new Date()
): OrderListQuery {
  const query: OrderListQuery = {
    view: params.view,
    search: params.q ? params.q : '',
    page: params.page,
    pageSize: params.pageSize,
    sort: 'newest',
  };

  if (params.payment) {
    query.paymentStatus = [params.payment];
  }

  if (params.product) {
    query.product = params.product;
  }

  if (params.processing) {
    if ((DESIGN_STATUSES as Record<string, true>)[params.processing]) {
      query.designStatus = [params.processing as DesignStatus];
    } else if ((FULFILLMENT_STATUSES as Record<string, true>)[params.processing]) {
      query.fulfillmentStatus = [params.processing as FulfillmentStatus];
    }
  }

  if (params.date) {
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const vnTime = new Date(now.getTime() + vnOffsetMs);
    const vnYear = vnTime.getUTCFullYear();
    const vnMonth = vnTime.getUTCMonth();
    const vnDate = vnTime.getUTCDate();

    let daysToSubtract = 0;
    if (params.date === 'today') {
      daysToSubtract = 0;
    } else if (params.date === '7d') {
      daysToSubtract = 6;
    } else if (params.date === '30d') {
      daysToSubtract = 29;
    }

    const startUtcMs = Date.UTC(vnYear, vnMonth, vnDate - daysToSubtract) - vnOffsetMs;
    query.createdFrom = new Date(startUtcMs).toISOString();
    query.createdTo = now.toISOString();
  }

  return query;
}
