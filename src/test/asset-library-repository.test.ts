import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AssetLibraryRepository } from '../lib/repositories/asset-library-repository.ts';

type Result = { data: unknown; error: { message: string } | null; count?: number | null };

class Query {
  readonly calls: unknown[][] = [];
  private readonly result: Result;
  constructor(result: Result) {
    this.result = result;
  }
  select(...args: unknown[]) { this.calls.push(['select', ...args]); return this; }
  eq(...args: unknown[]) { this.calls.push(['eq', ...args]); return this; }
  order(...args: unknown[]) { this.calls.push(['order', ...args]); return this; }
  range(...args: unknown[]) { this.calls.push(['range', ...args]); return this; }
  then(resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
}

class AssetLibraryClient {
  readonly tableCalls: { table: string; query: Query }[] = [];
  readonly rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  private readonly results: Record<string, Result>;
  constructor(results: Record<string, Result> = {}) {
    this.results = results;
  }
  from(table: string) {
    const query = new Query(this.results[table] ?? { data: [], error: null, count: 0 });
    this.tableCalls.push({ table, query });
    return query;
  }

  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    return this.results[name] ?? { data: { ok: true }, error: null };
  }
}

const familyRow = {
  id: 'inter', family_name: 'Inter', display_name: 'Inter UI', status: 'draft', revision: 2,
  ever_published_at: null, category: 'sans', tags: ['ui'], search_keywords: ['clean'],
  description: 'UI family', sample_text: 'Xin chào', created_by: 'actor', updated_by: 'actor',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
};

const faceRow = {
  id: 'face-1', family_id: 'inter', css_family: 'qt-face-face-1', format: 'woff2',
  weight_min: 400, weight_max: 700, style: 'normal', internal_family: 'Inter',
  postscript_name: 'Inter-Regular', storage_bucket: 'library-drafts', storage_path: 'faces/raw.woff2',
  checksum: 'sha-face', byte_size: 1234, mime_type: 'font/woff2', status: 'draft', revision: 3,
  ever_published_at: null, license: null, validation_id: null, created_by: 'actor', updated_by: 'actor',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
};

const stickerRow = {
  id: 'flower', category: 'floral', tags: ['pink'], storage_path: 'drafts/flower.svg',
  thumbnail_path: null, status: 'draft', revision: 1, ever_published_at: null,
  display_name: 'Hoa', search_keywords: ['hoa'], description: 'Hoa hồng', checksum: 'sha-sticker',
  mime_type: 'image/svg+xml', byte_size: 512, width: 100, height: 100, license: null,
  validation_id: null, created_by: 'actor', updated_by: 'actor', created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z', metadata: {},
};

test('maps family, face, sticker, and validation rows', async () => {
  const client = new AssetLibraryClient({
    fonts: { data: [familyRow], error: null, count: 1 },
    font_faces: { data: [faceRow], error: null, count: 1 },
    sticker_assets: { data: [stickerRow], error: null, count: 1 },
    library_validation_runs: {
      data: [{
        id: 'validation-1', kind: 'font-face', asset_id: 'face-1', revision: 3, checksum: 'sha-face',
        validator_version: '1', engine_fingerprint: 'chromium', passed: true, failures: [],
        missing_codepoints: [7841], browser_proof_hash: 'browser', production_proof_hash: null,
      }], error: null
    },
  });
  const repository = new AssetLibraryRepository(client as never);

  assert.deepEqual(await repository.listFontFamilies({ status: 'draft', page: 1, pageSize: 20 }), {
    items: [{
      id: 'inter', familyName: 'Inter', displayName: 'Inter UI', status: 'draft', revision: 2,
      everPublishedAt: null, category: 'sans', tags: ['ui'], searchKeywords: ['clean'],
      description: 'UI family', sampleText: 'Xin chào', createdBy: 'actor', updatedBy: 'actor',
      createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z',
    }], total: 1,
  });
  assert.equal(client.tableCalls[0]?.table, 'fonts');
  assert.deepEqual(client.tableCalls[0]?.query.calls.slice(-2), [['order', 'updated_at', { ascending: false }], ['range', 0, 19]]);

  assert.deepEqual(await repository.listFontFaces('inter'), [{
    ref: { kind: 'font-face', id: 'face-1', checksum: 'sha-face' }, status: 'draft', revision: 3,
    everPublishedAt: null, binary: { bucket: 'library-drafts', key: 'faces/raw.woff2', checksum: 'sha-face', byteSize: 1234, mimeType: 'font/woff2' },
    thumbnail: null, displayName: 'Inter', category: '', tags: [], searchKeywords: [], description: '', sampleText: null,
    license: null, validationId: null, familyId: 'inter', cssFamily: 'qt-face-face-1', format: 'woff2',
    weightMin: 400, weightMax: 700, style: 'normal', internalFamily: 'Inter', postscriptName: 'Inter-Regular',
  }]);

  assert.deepEqual((await repository.listStickers({ page: 1, pageSize: 10 })).items[0], {
    ref: { kind: 'sticker', id: 'flower', checksum: 'sha-sticker' }, status: 'draft', revision: 1,
    everPublishedAt: null, binary: { bucket: 'library-drafts', key: 'drafts/flower.svg', checksum: 'sha-sticker', byteSize: 512, mimeType: 'image/svg+xml' },
    thumbnail: null, displayName: 'Hoa', category: 'floral', tags: ['pink'], searchKeywords: ['hoa'],
    description: 'Hoa hồng', sampleText: null, license: null, validationId: null, width: 100, height: 100,
  });

  assert.deepEqual(await repository.listValidationRuns('font-face', 'face-1'), [{
    id: 'validation-1', ref: { kind: 'font-face', id: 'face-1', checksum: 'sha-face' }, revision: 3,
    validatorVersion: '1', engineFingerprint: 'chromium', passed: true,
    failures: [], missingCodepoints: [7841], browserProofHash: 'browser', productionProofHash: null,
  }]);
});

test('maps every lifecycle RPC to exact database argument names', async () => {
  const client = new AssetLibraryClient();
  const repository = new AssetLibraryRepository(client as never);
  const actor = 'actor';
  const request = 'request';

  await repository.createDraft(actor, request, 'sticker', 'rose', { displayName: 'Rose' });
  await repository.patchMetadata(actor, request, 'sticker', 'rose', 1, { displayName: 'Hoa' });
  await repository.publish(actor, request, 'sticker', 'rose', 2, 'validation', { binary: 'public-key' });
  await repository.archive(actor, request, 'sticker', 'rose', 3, 'Retired');
  await repository.prepareDelete(actor, request, 'sticker', 'rose', 1);
  await repository.finishDelete(actor, 'intent');
  await repository.createFamily(actor, request, 'inter', { displayName: 'Inter' });
  await repository.patchFamily(actor, request, 'inter', 1, { displayName: 'Inter UI' });
  await repository.setFamilyStatus(actor, request, 'inter', 2, 'published');

  assert.deepEqual(client.rpcCalls, [
    { name: 'library_create_draft', args: { p_actor: actor, p_request: request, p_kind: 'sticker', p_id: 'rose', p_payload: { displayName: 'Rose' } } },
    { name: 'library_patch_metadata', args: { p_actor: actor, p_request: request, p_kind: 'sticker', p_id: 'rose', p_revision: 1, p_patch: { displayName: 'Hoa' } } },
    { name: 'library_publish', args: { p_actor: actor, p_request: request, p_kind: 'sticker', p_id: 'rose', p_revision: 2, p_validation: 'validation', p_public_objects: { binary: 'public-key' } } },
    { name: 'library_archive', args: { p_actor: actor, p_request: request, p_kind: 'sticker', p_id: 'rose', p_revision: 3, p_reason: 'Retired' } },
    { name: 'library_prepare_delete', args: { p_actor: actor, p_request: request, p_kind: 'sticker', p_id: 'rose', p_revision: 1 } },
    { name: 'library_finish_delete', args: { p_actor: actor, p_intent: 'intent' } },
    { name: 'library_create_family', args: { p_actor: actor, p_request: request, p_id: 'inter', p_payload: { displayName: 'Inter' } } },
    { name: 'library_patch_family', args: { p_actor: actor, p_request: request, p_id: 'inter', p_revision: 1, p_patch: { displayName: 'Inter UI' } } },
    { name: 'library_set_family_status', args: { p_actor: actor, p_request: request, p_id: 'inter', p_revision: 2, p_status: 'published' } },
  ]);
});

test('throws Supabase errors instead of returning partial data', async () => {
  const queryClient = new AssetLibraryClient({ fonts: { data: null, error: { message: 'query denied' } } });
  await assert.rejects(() => new AssetLibraryRepository(queryClient as never).listFontFamilies({ page: 1, pageSize: 20 }), /query denied/);

  const rpcClient = new AssetLibraryClient({ library_archive: { data: null, error: { message: 'REVISION_CONFLICT' } } });
  await assert.rejects(
    () => new AssetLibraryRepository(rpcClient as never).archive('actor', 'request', 'sticker', 'rose', 9, 'Retired'),
    /REVISION_CONFLICT/,
  );
});
