import test from 'node:test';
import assert from 'node:assert/strict';
import { serveAsset } from '../lib/services/serve-asset.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

test('serveAsset sets private cache-control on customer assets', async () => {
  const dummyClient = {
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
          error: null,
        }),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'asset-1',
              storage_bucket: 'customer-assets',
              storage_path: 'p1/asset-1.png',
              mimeType: 'image/png',
            },
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const res = await serveAsset('asset-1', {
    supabaseClient: dummyClient,
    actor: { kind: 'staff', userId: 'staff-1', role: 'admin' },
  });

  assert.equal(res.status, 200);
  const cacheControl = res.headers.get('Cache-Control');
  assert.match(cacheControl || '', /private/);
  assert.doesNotMatch(cacheControl || '', /public/);
});
