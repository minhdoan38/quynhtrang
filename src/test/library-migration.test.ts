import assert from 'node:assert/strict';
import test from 'node:test';

import { runMigration } from '../../scripts/state42-library-migrate.ts';

test('runMigration generates manifest and makes 0 updates in dry-run mode', async () => {
  const mockFonts = [
    { id: 'font-1', family_name: 'Font 1', published: true, status: 'draft', revision: 1 },
    { id: 'font-2', family_name: 'Font 2', published: false, status: 'draft', revision: 1 },
  ];
  const mockFaces: { id: string; family_id: string; status: string }[] = [];
  const mockStickers = [
    { id: 'sticker-1', published: true, status: 'draft', revision: 1 },
  ];
  const mockVersions = [
    {
      design_document: {
        elements: [
          { type: 'text', data: { fontFamily: 'Font 1' } },
          { type: 'sticker', data: { libraryAssetId: 'sticker-1' } },
        ],
      },
    },
  ];

  let updateCount = 0;

  const mockClient = {
    from(table: string) {
      return {
        select() {
          return {
            limit() {
              return Promise.resolve({ data: mockVersions, error: null });
            },
            then(resolve: (val: unknown) => void) {
              if (table === 'fonts') resolve({ data: mockFonts, error: null });
              else if (table === 'font_faces') resolve({ data: mockFaces, error: null });
              else if (table === 'sticker_assets') resolve({ data: mockStickers, error: null });
              else if (table === 'design_versions') resolve({ data: mockVersions, error: null });
              else resolve({ data: [], error: null });
            },
          };
        },
        update() {
          updateCount++;
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as NonNullable<Parameters<typeof runMigration>[0]>['client'];

  const manifest = await runMigration({
    apply: false,
    client: mockClient,
    logger: { log: () => { } },
  });

  assert.equal(manifest.appliedUpdates, 0, 'Dry run must apply zero updates');
  assert.equal(manifest.totalFamilies, 2);
  assert.equal(manifest.totalStickers, 1);
  assert.deepEqual(manifest.distinctDesignFontReferences, ['Font 1']);
  assert.deepEqual(manifest.distinctDesignStickerReferences, ['sticker-1']);
  assert.equal(updateCount, 0, 'No update calls executed in dry run');
});

test('runMigration executes updates only when apply is true', async () => {
  const mockFonts = [
    { id: 'font-1', family_name: 'Font 1', published: true, status: 'draft', revision: 1 },
  ];
  const mockStickers = [
    { id: 'sticker-1', published: true, status: 'draft', revision: 1 },
  ];

  let updateCount = 0;

  const mockClient = {
    from(table: string) {
      return {
        select() {
          return {
            limit() {
              return Promise.resolve({ data: [], error: null });
            },
            then(resolve: (val: unknown) => void) {
              if (table === 'fonts') resolve({ data: mockFonts, error: null });
              else if (table === 'font_faces') resolve({ data: [], error: null });
              else if (table === 'sticker_assets') resolve({ data: mockStickers, error: null });
              else resolve({ data: [], error: null });
            },
          };
        },
        update() {
          updateCount++;
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as NonNullable<Parameters<typeof runMigration>[0]>['client'];

  const manifest = await runMigration({
    apply: true,
    client: mockClient,
    logger: { log: () => { } },
  });

  assert.equal(manifest.appliedUpdates, 2, 'Apply mode updates unmigrated records');
  assert.equal(updateCount, 2, 'Two updates executed');
});
