import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextRequest } from 'next/server.js';
import { parseInboxQueryParams, toOrderListQuery } from '../lib/admin/inbox-query.ts';
import {
  getSecureThumbnailUrl,
  resolveApprovedThumbnailUrl,
} from '../lib/admin/thumbnail-delivery.ts';
import { GET as getAdminOrders } from '../app/api/admin/orders/route.ts';
import { GET as getAdminOrderDetail } from '../app/api/admin/orders/[id]/route.ts';

const now = new Date('2026-09-30T18:30:00.000Z');

test('query defaults and invalid filters are safe for URL and record inputs', () => {
  const expected = { view: 'attention', q: '', page: 1, pageSize: 20 };
  assert.deepEqual(parseInboxQueryParams(new URLSearchParams()), expected);
  assert.deepEqual(
    parseInboxQueryParams({
      view: 'unknown',
      payment: 'unknown',
      processing: 'unknown',
      product: 'unknown',
      date: 'unknown',
    }),
    expected
  );
  assert.deepEqual(
    parseInboxQueryParams({
      view: ['all', 'payment'],
      q: ['  Nguyễn AN ', 'ignored'],
      page: ['2', '3'],
    }),
    {
      view: 'all',
      q: 'nguyễn an',
      page: 2,
      pageSize: 20,
    }
  );
});

test('pagination clamps valid integers and rejects malformed or unsafe numbers', () => {
  const cases: Array<[string, number]> = [
    ['0', 10],
    ['-2', 10],
    ['9', 10],
    ['10', 10],
    ['50', 50],
    ['51', 50],
    ['999', 50],
    ['', 20],
    ['NaN', 20],
    ['Infinity', 20],
    ['2.5', 20],
    ['20x', 20],
  ];
  for (const [pageSize, expected] of cases) {
    assert.equal(parseInboxQueryParams({ pageSize }).pageSize, expected);
  }
  for (const page of ['0', '-1', '2.5', '1e3', 'NaN', 'Infinity', '9007199254740991']) {
    assert.equal(parseInboxQueryParams({ page }).page, 1, page);
  }
  assert.equal(parseInboxQueryParams({ page: '42' }).page, 42);
});

test('search normalizes order codes, customer names, and equivalent Vietnamese phones', () => {
  for (const [q, expected] of [
    ['  QT260930-0001 ', 'qt260930-0001'],
    ['  Nguyễn Văn An  ', 'nguyễn văn an'],
    ['090 123.45-67', '0901234567'],
    ['+84 90 123 4567', '0901234567'],
    ['84-90-123-4567', '0901234567'],
    ['(090) 123-4567', '0901234567'],
    ['  ', ''],
  ]) {
    assert.equal(parseInboxQueryParams({ q }).q, expected);
  }
});

test('view changes map without retaining another view or losing combined filters', () => {
  for (const view of ['attention', 'payment', 'production', 'all'] as const) {
    const result = toOrderListQuery(
      parseInboxQueryParams({
        view,
        payment: 'paid',
        processing: 'approved',
        product: 'card',
        page: '3',
        pageSize: '30',
      }),
      now
    );
    assert.deepEqual(result, {
      view,
      search: '',
      page: 3,
      pageSize: 30,
      sort: 'newest',
      paymentStatus: ['paid'],
      designStatus: ['approved'],
      product: 'card',
    });
  }
  assert.deepEqual(
    toOrderListQuery(parseInboxQueryParams({ processing: 'in_production' }), now).fulfillmentStatus,
    ['in_production']
  );
  assert.equal(
    toOrderListQuery(parseInboxQueryParams({ processing: 'in_production' }), now).designStatus,
    undefined
  );
});

test('date presets use Vietnam calendar midnight even when UTC date differs', () => {
  for (const [date, createdFrom] of [
    ['today', '2026-09-30T17:00:00.000Z'],
    ['7d', '2026-09-24T17:00:00.000Z'],
    ['30d', '2026-09-01T17:00:00.000Z'],
  ]) {
    const query = toOrderListQuery(parseInboxQueryParams({ date }), now);
    assert.equal(query.createdFrom, createdFrom);
    assert.equal(query.createdTo, now.toISOString());
  }
  assert.equal(toOrderListQuery(parseInboxQueryParams({}), now).createdFrom, undefined);
});

test('thumbnail delivery rejects URLs and path traversal instead of returning unsafe content', async () => {
  const client = {
    storage: {
      from() {
        throw new Error('Unsafe paths must not reach Storage');
      },
    },
  };
  for (const path of [
    null,
    '',
    ' ',
    'https://evil.test/a.png',
    'http://evil.test/a.png',
    'data:image/png;base64,abc',
    '//evil.test/a.png',
    '../secret',
    'a/../secret',
    'a\\secret',
    'a/%2e%2e/secret',
  ]) {
    assert.equal(await resolveApprovedThumbnailUrl(client as never, path), null, path ?? 'null');
    assert.equal(await getSecureThumbnailUrl(path, client as never), null, path ?? 'null');
  }
});

test('getSecureThumbnailUrl generates signed URL for safe storage path', async () => {
  const fakeClient = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl(path: string, expiresIn: number) {
            return Promise.resolve({
              data: { signedUrl: `https://storage.local/${bucket}/${path}?expires=${expiresIn}` },
              error: null,
            });
          },
        };
      },
    },
  };

  const url = await getSecureThumbnailUrl('approved-renders/preview-1.png', fakeClient as never);
  assert.equal(url, 'https://storage.local/approved-renders/preview-1.png?expires=3600');
});

test('admin orders API routes reject unauthorized callers with 401', async () => {
  const listReq = new Request('http://localhost/api/admin/orders') as unknown as NextRequest;
  const listRes = await getAdminOrders(listReq);
  assert.equal(listRes.status, 401);
  const listJson = await listRes.json();
  assert.equal(listJson.error, 'Chưa đăng nhập');

  const detailReq = new Request('http://localhost/api/admin/orders/ord-123') as unknown as NextRequest;
  const detailRes = await getAdminOrderDetail(detailReq, {
    params: Promise.resolve({ id: 'ord-123' }),
  });
  assert.equal(detailRes.status, 401);
  const detailJson = await detailRes.json();
  assert.equal(detailJson.error, 'Chưa đăng nhập');
});
