import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextResponse } from 'next/server.js';

import {
  createGuestOrderAccessToken,
  GUEST_ORDER_COOKIE_NAME,
  hashGuestOrderAccessToken,
  setGuestOrderAccessCookie,
  verifyGuestOrderAccess,
  verifyStaffAccess,
} from '../lib/guest-order-access.ts';
import { serverOrderStore } from '../lib/server-order-store.ts';

beforeEach(() => {
  serverOrderStore.clear();
});

test('createGuestOrderAccessToken generates cryptographically secure unique tokens', () => {
  const token1 = createGuestOrderAccessToken();
  const token2 = createGuestOrderAccessToken();

  assert.equal(typeof token1, 'string');
  assert.equal(typeof token2, 'string');
  assert.ok(token1.length >= 64, 'Token hex string length at least 64 chars');
  assert.notEqual(token1, token2, 'Consecutive tokens must not collide');
  assert.match(token1, /^[0-9a-f]+$/i, 'Token is valid hex string');
});

test('hashGuestOrderAccessToken computes deterministic SHA-256 hex hash', () => {
  const token = 'test-token-12345';
  const hash1 = hashGuestOrderAccessToken(token);
  const hash2 = hashGuestOrderAccessToken(`  ${token}  `);

  assert.equal(hash1, hash2, 'Trims whitespace before hashing');
  assert.equal(hash1.length, 64, 'SHA-256 hex is 64 characters');
  assert.equal(
    hash1,
    'e4c0a87e760240da600e6d0c5c37516742a3d691feb803a33dcbbe8405e64b1e',
    'Matches precomputed SHA-256 digest'
  );
});

test('setGuestOrderAccessCookie configures HttpOnly, SameSite=Lax, and Max-Age on response', () => {
  const response = NextResponse.json({ success: true });
  const token = 'guest-secret-token-abc';
  const orderId = 'order-test-1';

  setGuestOrderAccessCookie(response, token, orderId);

  const mainCookie = response.cookies.get(GUEST_ORDER_COOKIE_NAME);
  assert.ok(mainCookie, 'Sets main guest access cookie');
  assert.equal(mainCookie.value, token);
  assert.equal(mainCookie.httpOnly, true);
  assert.equal(mainCookie.sameSite, 'lax');
  assert.equal(mainCookie.path, '/');
  assert.equal(mainCookie.maxAge, 30 * 24 * 60 * 60);

  const orderCookie = response.cookies.get(`guest_order_token_${orderId}`);
  assert.ok(orderCookie, 'Sets order-specific cookie');
  assert.equal(orderCookie.value, token);
  assert.equal(orderCookie.httpOnly, true);
});

test('verifyGuestOrderAccess validates access from quynhtrang_guest_order_access cookie', async () => {
  const orderId = 'order-verified-1';
  const rawToken = createGuestOrderAccessToken();
  const tokenHash = hashGuestOrderAccessToken(rawToken);

  serverOrderStore.createGuestAccess(
    orderId,
    tokenHash,
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  const request = new Request(`http://localhost/api/orders/${orderId}`, {
    headers: {
      cookie: `${GUEST_ORDER_COOKIE_NAME}=${rawToken}`,
    },
  });

  const verified = await verifyGuestOrderAccess(request, orderId);
  assert.equal(verified, true);
});

test('verifyGuestOrderAccess validates access from order-specific cookie', async () => {
  const orderId = 'order-verified-2';
  const rawToken = createGuestOrderAccessToken();
  const tokenHash = hashGuestOrderAccessToken(rawToken);

  serverOrderStore.createGuestAccess(
    orderId,
    tokenHash,
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  const request = new Request(`http://localhost/api/orders/${orderId}`, {
    headers: {
      cookie: `guest_order_token_${orderId}=${rawToken}`,
    },
  });

  const verified = await verifyGuestOrderAccess(request, orderId);
  assert.equal(verified, true);
});

test('verifyGuestOrderAccess validates access from x-guest-token header', async () => {
  const orderId = 'order-verified-3';
  const rawToken = createGuestOrderAccessToken();
  const tokenHash = hashGuestOrderAccessToken(rawToken);

  serverOrderStore.createGuestAccess(
    orderId,
    tokenHash,
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  const request = new Request(`http://localhost/api/orders/${orderId}`, {
    headers: {
      'x-guest-token': rawToken,
    },
  });

  const verified = await verifyGuestOrderAccess(request, orderId);
  assert.equal(verified, true);
});

test('verifyGuestOrderAccess validates access from Authorization Bearer header', async () => {
  const orderId = 'order-verified-4';
  const rawToken = createGuestOrderAccessToken();
  const tokenHash = hashGuestOrderAccessToken(rawToken);

  serverOrderStore.createGuestAccess(
    orderId,
    tokenHash,
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  const request = new Request(`http://localhost/api/orders/${orderId}`, {
    headers: {
      authorization: `Bearer ${rawToken}`,
    },
  });

  const verified = await verifyGuestOrderAccess(request, orderId);
  assert.equal(verified, true);
});

test('verifyGuestOrderAccess rejects request with wrong token', async () => {
  const orderId = 'order-verified-5';
  const rawToken = createGuestOrderAccessToken();
  const tokenHash = hashGuestOrderAccessToken(rawToken);

  serverOrderStore.createGuestAccess(
    orderId,
    tokenHash,
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  const request = new Request(`http://localhost/api/orders/${orderId}`, {
    headers: {
      'x-guest-token': 'wrong-token-value',
    },
  });

  const verified = await verifyGuestOrderAccess(request, orderId);
  assert.equal(verified, false);
});

test('verifyGuestOrderAccess rejects token bound to a different orderId', async () => {
  const orderIdA = 'order-alpha';
  const orderIdB = 'order-beta';
  const tokenA = createGuestOrderAccessToken();
  const tokenB = createGuestOrderAccessToken();

  serverOrderStore.createGuestAccess(
    orderIdA,
    hashGuestOrderAccessToken(tokenA),
    new Date(Date.now() + 3600 * 1000).toISOString()
  );
  serverOrderStore.createGuestAccess(
    orderIdB,
    hashGuestOrderAccessToken(tokenB),
    new Date(Date.now() + 3600 * 1000).toISOString()
  );

  // Using token A to try to access order B
  const request = new Request(`http://localhost/api/orders/${orderIdB}`, {
    headers: {
      'x-guest-token': tokenA,
    },
  });

  const verified = await verifyGuestOrderAccess(request, orderIdB);
  assert.equal(verified, false);
});

test('verifyGuestOrderAccess rejects expired token', async () => {
  const orderId = 'order-expired';
  const rawToken = createGuestOrderAccessToken();
  const tokenHash = hashGuestOrderAccessToken(rawToken);

  // Expired 10 seconds ago
  serverOrderStore.createGuestAccess(
    orderId,
    tokenHash,
    new Date(Date.now() - 10000).toISOString()
  );

  const request = new Request(`http://localhost/api/orders/${orderId}`, {
    headers: {
      'x-guest-token': rawToken,
    },
  });

  const verified = await verifyGuestOrderAccess(request, orderId);
  assert.equal(verified, false);
});

test('verifyGuestOrderAccess rejects request with no credentials', async () => {
  const orderId = 'order-no-creds';
  const request = new Request(`http://localhost/api/orders/${orderId}`);
  const verified = await verifyGuestOrderAccess(request, orderId);
  assert.equal(verified, false);
});

test('verifyStaffAccess identifies valid admin and editor roles', async () => {
  const adminReq = new Request('http://localhost/api/orders/order-1', {
    headers: {
      'x-staff-user-id': 'admin-user-1',
      'x-staff-role': 'admin',
    },
  });
  const adminIdentity = await verifyStaffAccess(adminReq);
  assert.deepEqual(adminIdentity, { userId: 'admin-user-1', role: 'admin' });

  const editorReq = new Request('http://localhost/api/orders/order-1', {
    headers: {
      'x-staff-user-id': 'editor-user-2',
      'x-staff-role': 'editor',
    },
  });
  const editorIdentity = await verifyStaffAccess(editorReq);
  assert.deepEqual(editorIdentity, { userId: 'editor-user-2', role: 'editor' });

  const invalidReq = new Request('http://localhost/api/orders/order-1', {
    headers: {
      'x-staff-user-id': 'cust-1',
      'x-staff-role': 'customer',
    },
  });
  const invalidIdentity = await verifyStaffAccess(invalidReq);
  assert.equal(invalidIdentity, null);
});
