import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import type { BulkItemResult, ValidationReceipt } from '../lib/domain/asset-library.ts';
import type { StickerRecord } from '../lib/repositories/asset-library-repository.ts';
import {
  bulkPublishStickers,
  bulkUpdateStickerMetadata,
  bulkUploadStickers,
  deleteDraftAsset,
  LibraryServiceError,
} from '../lib/services/asset-library.ts';
import { runCleanup } from '../../scripts/state42-library-cleanup.ts';

const fixtures = join(process.cwd(), 'src', 'test', 'fixtures', 'library');
const editor = { userId: '10000000-0000-4000-8000-000000000001', role: 'editor' as const };
const admin = { ...editor, role: 'admin' as const };
const key = { expectedRevision: 1, requestId: '20000000-0000-4000-8000-000000000001' };

function sticker(id: string, overrides: Partial<StickerRecord> = {}): StickerRecord {
  return {
    ref: { kind: 'sticker', id, checksum: `checksum-${id}` },
    status: 'draft',
    revision: 1,
    everPublishedAt: null,
    binary: { bucket: 'library-drafts', key: `drafts/${id}.svg`, checksum: `checksum-${id}`, byteSize: 10, mimeType: 'image/svg+xml' },
    thumbnail: { bucket: 'library-drafts', key: `drafts/${id}-thumb.png`, checksum: '', byteSize: 5, mimeType: 'image/png' },
    displayName: id,
    category: 'floral',
    tags: [],
    searchKeywords: [],
    description: '',
    sampleText: null,
    license: null,
    validationId: null,
    width: 120,
    height: 80,
    ...overrides,
  };
}


class BulkRepository {
  readonly records = new Map<string, StickerRecord>();
  readonly calls: { name: string; args: unknown[] }[] = [];
  readonly removals: { bucket: string; keys: string[] }[] = [];
  duplicateAfter = Number.POSITIVE_INFINITY;
  duplicateChecks = 0;
  failPatch = new Set<string>();
  failPublish = new Set<string>();
  prepared = { intent: 'delete-intent', object_keys: ['drafts/delete.svg', 'drafts/delete-thumb.png'] };

  constructor(initial: StickerRecord[] = []) {
    for (const record of initial) this.records.set(record.ref.id, record);
  }

  async getRecord(ref: { id: string }) { return this.records.get(ref.id) ?? null; }
  async getSticker(id: string) { return this.records.get(id) ?? null; }
  async findDuplicate() {
    this.duplicateChecks += 1;
    return this.duplicateChecks >= this.duplicateAfter ? sticker('duplicate') : null;
  }
  async uploadObject(...args: unknown[]) { this.calls.push({ name: 'uploadObject', args }); }
  async createDraft(_actor: string, _request: string, _kind: string, id: string) {
    this.records.set(id, sticker(id));
  }
  async removeObjects(bucket: string, keys: string[]) { this.removals.push({ bucket, keys }); }
  async prepareDelete(...args: unknown[]) { this.calls.push({ name: 'prepareDelete', args }); return this.prepared; }
  async finishDelete(...args: unknown[]) { this.calls.push({ name: 'finishDelete', args }); }
  async patchMetadata(_actor: string, _request: string, _kind: string, id: string, revision: number) {
    if (this.failPatch.has(id)) throw new Error('REVISION_CONFLICT');
    const current = this.records.get(id)!;
    this.records.set(id, { ...current, revision: revision + 1 });
  }
  async getValidationRunById(id: string): Promise<ValidationReceipt | null> {
    const assetId = id.replace('validation-', '');
    const current = this.records.get(assetId);
    return current ? {
      id,
      ref: current.ref,
      revision: current.revision,
      validatorVersion: '1',
      engineFingerprint: 'test',
      passed: true,
      failures: [],
      missingCodepoints: [],
      browserProofHash: 'browser',
      productionProofHash: 'production',
    } : null;
  }
  async copyObject(...args: unknown[]) { this.calls.push({ name: 'copyObject', args }); }
  async publish(_actor: string, _request: string, _kind: string, id: string, revision: number) {
    if (this.failPublish.has(id)) throw new Error('REVISION_CONFLICT');
    const current = this.records.get(id)!;
    this.records.set(id, { ...current, status: 'published', revision: revision + 1 });
  }
}
test('deleteDraftAsset enforces admin and never-published guards before mutation', async () => {
  const repo = new BulkRepository([sticker('delete')]);
  await assert.rejects(
    deleteDraftAsset(sticker('delete').ref, key, editor, repo as never),
    (err: unknown) => err instanceof LibraryServiceError && err.code === 'FORBIDDEN',
  );
  assert.equal(repo.calls.length, 0);

  repo.records.set('delete', sticker('delete', { status: 'published', everPublishedAt: '2026-10-01T00:00:00Z' }));
  await assert.rejects(
    deleteDraftAsset(sticker('delete').ref, key, admin, repo as never),
    (err: unknown) => err instanceof LibraryServiceError && err.code === 'IMMUTABLE_BINARY',
  );

  repo.records.set('delete', sticker('delete', { everPublishedAt: '2026-10-01T00:00:00Z' }));
  await assert.rejects(
    deleteDraftAsset(sticker('delete').ref, key, admin, repo as never),
    (err: unknown) => err instanceof LibraryServiceError && err.code === 'REFERENCED_DRAFT',
  );
  assert.equal(repo.calls.length, 0);
});

test('deleteDraftAsset prepares, removes only private draft keys, then finishes', async () => {
  const repo = new BulkRepository([sticker('delete')]);
  await deleteDraftAsset(sticker('delete').ref, key, admin, repo as never);

  assert.deepEqual(repo.calls, [
    { name: 'prepareDelete', args: [sticker('delete').ref, 1, admin.userId, key.requestId] },
    { name: 'finishDelete', args: [admin.userId, 'delete-intent'] },
  ]);
  assert.deepEqual(repo.removals, [{ bucket: 'library-drafts', keys: ['drafts/delete.svg', 'drafts/delete-thumb.png'] }]);
});

test('bulkUploadStickers reports mixed outcomes in input order and validates batch size', async () => {
  const safe = new Uint8Array(await readFile(join(fixtures, 'safe-sticker.svg')));
  const hostile = new Uint8Array(await readFile(join(fixtures, 'malicious-script.svg')));
  const repo = new BulkRepository();
  repo.duplicateAfter = 2;

  const results = await bulkUploadStickers([
    { bytes: safe, filename: 'safe.svg', metadata: { displayName: 'Safe' }, requestId: 'request-safe' },
    { bytes: hostile, filename: 'hostile.svg', metadata: { displayName: 'Hostile' }, requestId: 'request-hostile' },
    { bytes: safe, filename: 'duplicate.svg', metadata: { displayName: 'Duplicate' }, requestId: 'request-duplicate' },
  ], editor, repo as never, { concurrency: 1 });

  assert.deepEqual(results.map(({ ok, error }: BulkItemResult) => ({ ok, error })), [
    { ok: true, error: undefined },
    { ok: false, error: 'VALIDATION_FAILED' },
    { ok: false, error: 'DUPLICATE_BINARY' },
  ]);
  await assert.rejects(
    bulkUploadStickers([], editor, repo as never),
    (err: unknown) => err instanceof LibraryServiceError && err.code === 'INVALID_INPUT',
  );
  await assert.rejects(
    bulkUploadStickers(Array.from({ length: 51 }, (_, index) => ({
      bytes: safe,
      metadata: { displayName: String(index) },
      requestId: `request-${index}`,
    })), editor, repo as never),
    (err: unknown) => err instanceof LibraryServiceError && err.code === 'INVALID_INPUT',
  );
});

test('bulk metadata and publish operations isolate failures and preserve order', async () => {
  const repo = new BulkRepository([sticker('one'), sticker('two'), sticker('three')]);
  repo.failPatch.add('two');
  const metadata = await bulkUpdateStickerMetadata(['one', 'two', 'three'].map((id) => ({
    ref: sticker(id).ref,
    key: { ...key, requestId: `metadata-${id}` },
    patch: { displayName: `Updated ${id}` },
  })), editor, repo as never);
  assert.deepEqual(metadata.map(({ ref, ok, revision, error }: BulkItemResult) => ({ id: ref.id, ok, revision, error })), [
    { id: 'one', ok: true, revision: 2, error: undefined },
    { id: 'two', ok: false, revision: undefined, error: 'REVISION_CONFLICT' },
    { id: 'three', ok: true, revision: 2, error: undefined },
  ]);

  repo.failPublish.add('two');
  const published = await bulkPublishStickers(['one', 'two', 'three'].map((id) => ({
    ref: repo.records.get(id)!.ref,
    key: { expectedRevision: repo.records.get(id)!.revision, requestId: `publish-${id}` },
    validationId: `validation-${id}`,
  })), editor, repo as never);
  assert.deepEqual(published.map(({ ref, ok, error }: BulkItemResult) => ({ id: ref.id, ok, error })), [
    { id: 'one', ok: true, error: undefined },
    { id: 'two', ok: false, error: 'REVISION_CONFLICT' },
    { id: 'three', ok: true, error: undefined },
  ]);
});

class CleanupQuery implements PromiseLike<{ data: unknown; error: null }> {
  private readonly table: string;
  private readonly client: CleanupClient;
  private id: string | null = null;
  private operation: 'select' | 'update' = 'select';
  constructor(table: string, client: CleanupClient) { this.table = table; this.client = client; }
  select() { return this; }
  in() { return this; }
  lt() { return this; }
  eq(column: string, value: string) { if (column === 'id') this.id = value; return this; }
  maybeSingle() { return this; }
  update() { this.operation = 'update'; return this; }
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let data: unknown;
    if (this.table === 'library_uploads' && this.operation === 'select') data = this.client.uploads;
    else if (this.operation === 'update') { this.client.cleaned.push(this.id!); data = null; }
    else data = this.client.assets[this.id ?? ''] ?? null;
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

class CleanupClient {
  uploads = [
    { id: 'safe', kind: 'sticker', asset_id: 'safe', bucket: 'library-drafts', storage_path: 'drafts/safe.svg', state: 'cleanup_pending', expires_at: '2026-01-01T00:00:00Z' },
    { id: 'published', kind: 'sticker', asset_id: 'published', bucket: 'library-drafts', storage_path: 'drafts/published.svg', state: 'cleanup_pending', expires_at: '2026-01-01T00:00:00Z' },
  ];
  assets: Record<string, unknown> = {
    safe: { status: 'draft', ever_published_at: null, storage_path: 'drafts/safe.svg', thumbnail_path: 'drafts/safe-thumb.png' },
    published: { status: 'archived', ever_published_at: '2026-01-01T00:00:00Z', storage_path: 'stickers/published.svg', thumbnail_path: null },
  };
  removed: { bucket: string; keys: string[] }[] = [];
  cleaned: string[] = [];
  from(table: string) { return new CleanupQuery(table, this); }
  storage = { from: (bucket: string) => ({ remove: async (keys: string[]) => { this.removed.push({ bucket, keys }); return { error: null }; } }) };
}

test('cleanup runner defaults to dry-run and apply never removes ever-published objects', async () => {
  const dryClient = new CleanupClient();
  assert.deepEqual(await runCleanup({ client: dryClient as never, logger: { log() { } } }), { found: 2, eligible: 1, cleaned: 0, skipped: 1 });
  assert.deepEqual(dryClient.removed, []);
  assert.deepEqual(dryClient.cleaned, []);

  const applyClient = new CleanupClient();
  assert.deepEqual(await runCleanup({ apply: true, client: applyClient as never, logger: { log() { } } }), { found: 2, eligible: 1, cleaned: 1, skipped: 1 });
  assert.deepEqual(applyClient.removed, [{ bucket: 'library-drafts', keys: ['drafts/safe.svg', 'drafts/safe-thumb.png'] }]);
  assert.deepEqual(applyClient.cleaned, ['safe']);
});
