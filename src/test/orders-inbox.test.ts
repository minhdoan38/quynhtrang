import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  parseInboxQueryParams,
  buildInboxQueryString,
  buildInboxUrl,
  buildOrderDetailUrl,
  getViewCounts,
  getNextViewQuery,
  isFilterActive,
  resetFilterQuery,
  formatVnd,
  FORBIDDEN_MUTATION_ACTIONS,
  type InboxQueryParams,
} from '../lib/admin/inbox-query.ts';
import type { InboxCounts } from '../lib/domain/order.ts';

const rootDir = process.cwd();

test('view count mapping extracts counts for all 4 inbox tabs from InboxCounts', () => {
  const counts: InboxCounts = {
    all: 42,
    needsAttention: 7,
    paymentReported: 5,
    designReview: 2,
    readyForProduction: 12,
  };

  const mapped = getViewCounts(counts);
  assert.equal(mapped.attention, 7, 'attention count maps needsAttention');
  assert.equal(mapped.payment, 5, 'payment count maps paymentReported');
  assert.equal(mapped.production, 12, 'production count maps readyForProduction');
  assert.equal(mapped.all, 42, 'all count maps all');
});

test('tab switching logic resets page to 1 while preserving active filters and search', () => {
  const current: InboxQueryParams = {
    view: 'attention',
    q: '0912345678',
    payment: 'payment_reported',
    product: 'wrapping',
    date: '7d',
    page: 4,
    pageSize: 20,
  };

  const switchedToPayment = getNextViewQuery(current, 'payment');
  assert.equal(switchedToPayment.view, 'payment');
  assert.equal(switchedToPayment.page, 1, 'switching view must reset page to 1');
  assert.equal(switchedToPayment.q, '0912345678', 'search preserved');
  assert.equal(switchedToPayment.product, 'wrapping', 'product filter preserved');
  assert.equal(switchedToPayment.date, '7d', 'date filter preserved');

  const switchedToAll = getNextViewQuery(switchedToPayment, 'all');
  assert.equal(switchedToAll.view, 'all');
  assert.equal(switchedToAll.page, 1);
});

test('filter query serialization omits defaults and empty values cleanly', () => {
  const defaultQuery: InboxQueryParams = {
    view: 'attention',
    q: '',
    page: 1,
    pageSize: 20,
  };
  assert.equal(buildInboxQueryString(defaultQuery), '', 'default query serializes to empty query string');

  const filteredQuery: InboxQueryParams = {
    view: 'payment',
    q: '0987654321',
    payment: 'paid',
    product: 'sticker',
    date: '30d',
    page: 2,
    pageSize: 20,
  };
  const qs = buildInboxQueryString(filteredQuery);
  assert.ok(qs.includes('view=payment'), 'includes non-default view');
  assert.ok(qs.includes('q=0987654321'), 'includes search q');
  assert.ok(qs.includes('payment=paid'), 'includes payment filter');
  assert.ok(qs.includes('product=sticker'), 'includes product filter');
  assert.ok(qs.includes('date=30d'), 'includes date filter');
  assert.ok(qs.includes('page=2'), 'includes page 2');
  assert.ok(!qs.includes('pageSize='), 'omits default pageSize 20');
});

test('URL query reconstruction round-trips through parseInboxQueryParams', () => {
  const original: InboxQueryParams = {
    view: 'production',
    q: 'ord-123456',
    payment: 'paid',
    processing: 'ready_for_production',
    product: 'card',
    date: 'today',
    page: 3,
    pageSize: 30,
  };

  const url = buildInboxUrl('/admin/orders', original);
  assert.ok(url.startsWith('/admin/orders?'), 'URL starts with /admin/orders?');

  const searchParams = new URL(url, 'https://quynhtrang.vn').searchParams;
  const reconstructed = parseInboxQueryParams(searchParams);

  assert.equal(reconstructed.view, original.view);
  assert.equal(reconstructed.q, original.q);
  assert.equal(reconstructed.payment, original.payment);
  assert.equal(reconstructed.processing, original.processing);
  assert.equal(reconstructed.product, original.product);
  assert.equal(reconstructed.date, original.date);
  assert.equal(reconstructed.page, original.page);
  assert.equal(reconstructed.pageSize, original.pageSize);
});

test('buildOrderDetailUrl preserves returnTo query string for back navigation', () => {
  const query: InboxQueryParams = {
    view: 'attention',
    q: 'Lan',
    product: 'wrapping',
    page: 2,
    pageSize: 20,
  };

  const detailUrl = buildOrderDetailUrl('order-abc-123', query);
  assert.ok(detailUrl.startsWith('/admin/orders/order-abc-123?returnTo='), 'preserves returnTo param');
  const returnTo = new URL(detailUrl, 'https://quynhtrang.vn').searchParams.get('returnTo');
  assert.ok(returnTo, 'returnTo must be present');
  assert.ok(returnTo.includes('q=lan'));
  assert.ok(returnTo.includes('product=wrapping'));
  assert.ok(returnTo.includes('page=2'));
});

test('isFilterActive and resetFilterQuery correctly detect and clear non-view filters', () => {
  const clean: InboxQueryParams = {
    view: 'attention',
    q: '',
    page: 1,
    pageSize: 20,
  };
  assert.equal(isFilterActive(clean), false, 'clean query has no active filters');

  const withSearch: InboxQueryParams = { ...clean, q: 'test' };
  assert.equal(isFilterActive(withSearch), true);

  const withProduct: InboxQueryParams = { ...clean, product: 'notebook' };
  assert.equal(isFilterActive(withProduct), true);

  const complex: InboxQueryParams = {
    view: 'production',
    q: 'Nguyen',
    payment: 'paid',
    date: '7d',
    page: 5,
    pageSize: 20,
  };
  assert.equal(isFilterActive(complex), true);

  const reset = resetFilterQuery(complex);
  assert.equal(reset.view, 'production', 'preserves active view tab');
  assert.equal(reset.q, '', 'clears search');
  assert.equal(reset.payment, undefined, 'clears payment filter');
  assert.equal(reset.product, undefined, 'clears product filter');
  assert.equal(reset.date, undefined, 'clears date filter');
  assert.equal(reset.page, 1, 'resets page to 1');
  assert.equal(isFilterActive(reset), false);
});

test('formatVnd formats numbers as Vietnamese Dong currency string', () => {
  assert.equal(formatVnd(0), '0 ₫');
  assert.equal(formatVnd(150000), '150.000 ₫');
  assert.equal(formatVnd(1250000), '1.250.000 ₫');
});

test('inbox rows are read-only and contain no high-risk mutation buttons', () => {
  const orderRowFile = resolve(rootDir, 'src/components/admin/order-row.tsx');
  assert.ok(existsSync(orderRowFile), 'src/components/admin/order-row.tsx must exist');
  const source = readFileSync(orderRowFile, 'utf8');

  for (const forbidden of FORBIDDEN_MUTATION_ACTIONS) {
    assert.ok(
      !source.includes(`>${forbidden}<`) &&
      !source.includes(`"${forbidden}"`) &&
      !source.includes(`'${forbidden}'`),
      `Order row must not contain mutation action button: ${forbidden}`
    );
  }

  // Row must link to order detail
  assert.ok(
    source.includes('/admin/orders/') || source.includes('href'),
    'Order row must provide link navigation to order detail'
  );
});

test('all required Task 9 UI component files exist and satisfy architecture contracts', () => {
  const files = [
    'src/app/admin/orders/page.tsx',
    'src/app/admin/orders/orders-inbox-client.tsx',
    'src/components/admin/orders-inbox.tsx',
    'src/components/admin/order-row.tsx',
    'src/components/admin/order-filters.tsx',
    'src/components/admin/order-thumbnail.tsx',
    'src/components/admin/admin-empty-state.tsx',
  ];

  for (const file of files) {
    const fullPath = resolve(rootDir, file);
    assert.ok(existsSync(fullPath), `Required file ${file} must exist`);
  }

  // 1. Server Page checks
  const pageSource = readFileSync(resolve(rootDir, 'src/app/admin/orders/page.tsx'), 'utf8');
  assert.ok(pageSource.includes('requireStaff'), 'page.tsx must call requireStaff');
  assert.ok(pageSource.includes('parseInboxQueryParams'), 'page.tsx must call parseInboxQueryParams');
  assert.ok(pageSource.includes('OrderRepository'), 'page.tsx must use OrderRepository');
  assert.ok(pageSource.includes('listInbox'), 'page.tsx must call listInbox');
  assert.ok(pageSource.includes('countViews'), 'page.tsx must call countViews');
  assert.ok(pageSource.includes('OrdersInboxClient'), 'page.tsx must render OrdersInboxClient');

  // 2. Client Component checks
  const clientSource = readFileSync(resolve(rootDir, 'src/app/admin/orders/orders-inbox-client.tsx'), 'utf8');
  assert.ok(clientSource.includes("'use client'") || clientSource.includes('"use client"'), 'orders-inbox-client must be client component');
  assert.ok(clientSource.includes('useRouter'), 'orders-inbox-client must use router for URL synchronization');
  assert.ok(clientSource.includes('300'), 'orders-inbox-client must debounce search input with 300ms');
  assert.ok(clientSource.includes('useGSAP') || clientSource.includes('gsap'), 'orders-inbox-client must include GSAP motion');
  assert.ok(clientSource.includes('prefers-reduced-motion'), 'orders-inbox-client must check prefers-reduced-motion');

  // 3. Orders Inbox presentation checks
  const inboxSource = readFileSync(resolve(rootDir, 'src/components/admin/orders-inbox.tsx'), 'utf8');
  assert.ok(inboxSource.includes('Cần xử lý'), 'Inbox must render Cần xử lý tab');
  assert.ok(inboxSource.includes('Chờ tiền'), 'Inbox must render Chờ tiền tab');
  assert.ok(inboxSource.includes('Sẵn sàng'), 'Inbox must render Sẵn sàng tab');
  assert.ok(inboxSource.includes('Tất cả'), 'Inbox must render Tất cả tab');
  assert.ok(inboxSource.includes('Chưa có đơn hàng.'), 'Inbox must have empty state text "Chưa có đơn hàng."');
  assert.ok(inboxSource.includes('Không có đơn phù hợp.'), 'Inbox must have filtered empty state text "Không có đơn phù hợp."');
  assert.ok(inboxSource.includes('Xóa bộ lọc'), 'Inbox must have "Xóa bộ lọc" button in filtered empty state');

  // 4. Order Filters checks
  const filterSource = readFileSync(resolve(rootDir, 'src/components/admin/order-filters.tsx'), 'utf8');
  assert.ok(filterSource.includes('Tìm mã đơn, tên, SĐT...'), 'Filters must have required search placeholder');

  // 5. Order Thumbnail checks
  const thumbnailSource = readFileSync(resolve(rootDir, 'src/components/admin/order-thumbnail.tsx'), 'utf8');
  assert.ok(thumbnailSource.includes('img') || thumbnailSource.includes('Image'), 'Thumbnail component must render image when URL provided');

  // 6. Admin Empty State checks
  const emptySource = readFileSync(resolve(rootDir, 'src/components/admin/admin-empty-state.tsx'), 'utf8');
  assert.ok(emptySource.includes('AdminEmptyState') || emptySource.includes('export function'), 'Empty state must export component');
});
