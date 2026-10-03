import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTemplateTarget,
  templateTargetsEqual,
  validateTemplateDocument,
  getTemplateAvailability,
  listAllSupportedTargetKeys,
} from '../lib/template-target.ts';
import { readDesignDocument } from '../lib/design-document.ts';
import { makeCardDocument } from './fixtures/templates.ts';
import type { TemplateAvailabilityDependencies } from '../lib/domain/template.ts';

test('createTemplateTarget - exact equality and concrete regression', () => {
  const circle = createTemplateTarget({
    productId: 'sticker',
    variantId: 'fixed-shape',
    mode: null,
    shape: 'circle',
  });
  const rectangle = createTemplateTarget({
    productId: 'sticker',
    variantId: 'fixed-shape',
    mode: null,
    shape: 'rectangle',
  });
  assert.equal(templateTargetsEqual(circle, rectangle), false);

  const card = createTemplateTarget({
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
  });
  assert.deepEqual(card.surfaces.map((s: { id: string }) => s.id), ['front', 'inside', 'back']);
  assert.throws(() =>
    createTemplateTarget({
      productId: 'card',
      variantId: 'a1',
      mode: null,
      shape: null,
    }),
  );
});

test('createTemplateTarget - card horizontal vs vertical surfaces and geometry', () => {
  const cardH = createTemplateTarget({
    productId: 'card',
    variantId: 'horizontal',
    mode: null,
    shape: null,
  });
  const cardV = createTemplateTarget({
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
  });

  assert.equal(templateTargetsEqual(cardH, cardV), false);
  assert.deepEqual(cardH.surfaces, [
    { id: 'front', widthMm: 148, heightMm: 105 },
    { id: 'inside', widthMm: 296, heightMm: 105 },
    { id: 'back', widthMm: 148, heightMm: 105 },
  ]);
  assert.deepEqual(cardV.surfaces, [
    { id: 'front', widthMm: 105, heightMm: 148 },
    { id: 'inside', widthMm: 210, heightMm: 148 },
    { id: 'back', widthMm: 105, heightMm: 148 },
  ]);
  assert.equal(
    cardH.geometryKey,
    'card:horizontal:mode:none:shape:none:surfaces:front-148x105_inside-296x105_back-148x105',
  );
  assert.equal(
    cardV.geometryKey,
    'card:vertical:mode:none:shape:none:surfaces:front-105x148_inside-210x148_back-105x148',
  );
});

test('createTemplateTarget - wrapping A1 vs A2, pattern vs full-sheet', () => {
  const a1Pattern = createTemplateTarget({
    productId: 'wrapping',
    variantId: 'a1',
    mode: 'pattern',
    shape: null,
  });
  const a1FullSheet = createTemplateTarget({
    productId: 'wrapping',
    variantId: 'a1',
    mode: 'full-sheet',
    shape: null,
  });
  const a2Pattern = createTemplateTarget({
    productId: 'wrapping',
    variantId: 'a2',
    mode: 'pattern',
    shape: null,
  });

  assert.equal(templateTargetsEqual(a1Pattern, a1FullSheet), false);
  assert.equal(templateTargetsEqual(a1Pattern, a2Pattern), false);
  assert.deepEqual(a1Pattern.surfaces, [{ id: 'sheet', widthMm: 594, heightMm: 841 }]);
  assert.deepEqual(a2Pattern.surfaces, [{ id: 'sheet', widthMm: 420, heightMm: 594 }]);

  // Wrapping requires mode to be non-null
  assert.throws(() =>
    createTemplateTarget({
      productId: 'wrapping',
      variantId: 'a1',
      mode: null,
      shape: null,
    }),
  );
});

test('createTemplateTarget - notebook standard front-only', () => {
  const notebook = createTemplateTarget({
    productId: 'notebook',
    variantId: 'standard',
    mode: null,
    shape: null,
  });

  assert.deepEqual(notebook.surfaces, [{ id: 'front', widthMm: 148, heightMm: 210 }]);
  assert.equal(
    notebook.geometryKey,
    'notebook:standard:mode:none:shape:none:surfaces:front-148x210',
  );
  assert.throws(() =>
    createTemplateTarget({
      productId: 'notebook',
      variantId: 'horizontal',
      mode: null,
      shape: null,
    }),
  );
});

test('createTemplateTarget - sticker shapes and variants', () => {
  const dieCut = createTemplateTarget({
    productId: 'sticker',
    variantId: 'die-cut',
    mode: null,
    shape: null,
  });
  const phone = createTemplateTarget({
    productId: 'sticker',
    variantId: 'phone',
    mode: null,
    shape: null,
  });
  const circle = createTemplateTarget({
    productId: 'sticker',
    variantId: 'fixed-shape',
    mode: null,
    shape: 'circle',
  });
  const roundedRect = createTemplateTarget({
    productId: 'sticker',
    variantId: 'fixed-shape',
    mode: null,
    shape: 'rounded-rectangle',
  });

  assert.deepEqual(dieCut.surfaces, [{ id: 'front', widthMm: 50, heightMm: 50 }]);
  assert.deepEqual(phone.surfaces, [{ id: 'front', widthMm: 50, heightMm: 50 }]);
  assert.deepEqual(circle.surfaces, [{ id: 'front', widthMm: 50, heightMm: 50 }]);
  assert.deepEqual(roundedRect.surfaces, [{ id: 'front', widthMm: 70, heightMm: 50 }]);

  // Fixed shape requires valid shape
  assert.throws(() =>
    createTemplateTarget({
      productId: 'sticker',
      variantId: 'fixed-shape',
      mode: null,
      shape: null,
    }),
  );
  // Die-cut cannot have shape
  assert.throws(() =>
    createTemplateTarget({
      productId: 'sticker',
      variantId: 'die-cut',
      mode: null,
      shape: 'circle',
    }),
  );
});

test('readDesignDocument - schema 0 legacy migration and raw preservation', () => {
  const rawLegacy = {
    text: 'Lời chúc mừng',
    color: '#2E3338',
    backgroundColor: '#FFFDF8',
    productOptions: {
      card: { surface: 'front', fold: 'half' },
      wrapping: { mode: 'pattern' },
    },
    elements: [
      {
        id: 'el-1',
        type: 'text',
        x: 10,
        y: 10,
        width: 50,
        height: 10,
        rotation: 0,
        surface: 'front',
        data: { text: 'Hello' },
      },
    ],
  };

  const rawCopy = JSON.parse(JSON.stringify(rawLegacy));
  const cardTarget = createTemplateTarget({
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
  });

  const migrated = readDesignDocument(rawLegacy, 0, cardTarget);

  // Raw input is not mutated
  assert.deepEqual(rawLegacy, rawCopy);
  // Migrated has required DesignState fields
  assert.equal(migrated.productId, 'card');
  assert.equal(migrated.variantId, 'vertical');
  assert.equal(migrated.documentSchemaVersion, 1);
  assert.equal(migrated.text, 'Lời chúc mừng');
  assert.deepEqual(migrated.productOptions, { surface: 'front', fold: 'half' });
  assert.equal(migrated.elements?.length, 1);
});

test('readDesignDocument - rejection of unknown schema and malformed data', () => {
  const cardTarget = createTemplateTarget({
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
  });

  // Future schema version rejected
  assert.throws(
    () => readDesignDocument({ productId: 'card', variantId: 'vertical' }, 2, cardTarget),
    /unsupported document schema version/i,
  );
  // Negative schema version rejected
  assert.throws(
    () => readDesignDocument({ productId: 'card', variantId: 'vertical' }, -1, cardTarget),
    /unsupported document schema version/i,
  );
  // Non-object raw rejected
  assert.throws(() => readDesignDocument(null, 1, cardTarget), /invalid raw document/i);
  assert.throws(() => readDesignDocument('string', 1, cardTarget), /invalid raw document/i);

  // Nonfinite / negative frame rejected during read
  assert.throws(
    () =>
      readDesignDocument(
        {
          productId: 'card',
          variantId: 'vertical',
          elements: [{ id: 'bad-1', type: 'text', x: NaN, y: 0, width: 10, height: 10 }],
        },
        1,
        cardTarget,
      ),
    /non-finite|invalid frame/i,
  );
  assert.throws(
    () =>
      readDesignDocument(
        {
          productId: 'card',
          variantId: 'vertical',
          elements: [{ id: 'bad-2', type: 'text', x: 0, y: 0, width: -5, height: 10 }],
        },
        1,
        cardTarget,
      ),
    /negative|invalid frame/i,
  );

  // Group cycle rejected
  assert.throws(
    () =>
      readDesignDocument(
        {
          productId: 'card',
          variantId: 'vertical',
          elements: [
            { id: 'g1', type: 'text', x: 0, y: 0, width: 10, height: 10, parentGroupId: 'g2' },
            { id: 'g2', type: 'text', x: 0, y: 0, width: 10, height: 10, parentGroupId: 'g1' },
          ],
        },
        1,
        cardTarget,
      ),
    /cycl/i,
  );
});

test('validateTemplateDocument - detects target mismatches and element violations', () => {
  const cardTarget = createTemplateTarget({
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
  });
  const validDoc = makeCardDocument();

  // Valid card passes
  const validFindings = validateTemplateDocument(validDoc, cardTarget);
  assert.deepEqual(validFindings, []);

  // Product mismatch
  const wrongProduct = { ...validDoc, productId: 'notebook' as const };
  const prodFindings = validateTemplateDocument(wrongProduct, cardTarget);
  assert.ok(prodFindings.some((f: { code: string }) => f.code === 'PRODUCT_MISMATCH'));

  // Variant mismatch
  const wrongVariant = { ...validDoc, variantId: 'horizontal' };
  const varFindings = validateTemplateDocument(wrongVariant, cardTarget);
  assert.ok(varFindings.some((f: { code: string }) => f.code === 'VARIANT_MISMATCH'));

  // Element on invalid surface for notebook (notebook is front only)
  const notebookTarget = createTemplateTarget({
    productId: 'notebook',
    variantId: 'standard',
    mode: null,
    shape: null,
  });
  const notebookWithInsideSurface = {
    productId: 'notebook' as const,
    variantId: 'standard',
    templateId: null,
    text: '',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    quantity: 1,
    productOptions: {},
    elements: [
      {
        id: 'el-inside',
        type: 'text' as const,
        x: 10,
        y: 10,
        width: 30,
        height: 10,
        rotation: 0,
        surface: 'inside' as const,
      },
    ],
  };
  const surfaceFindings = validateTemplateDocument(notebookWithInsideSurface, notebookTarget);
  assert.ok(surfaceFindings.some((f: { code: string }) => f.code === 'INVALID_SURFACE'));

  // Non-finite frame
  const badFrameDoc = {
    ...validDoc,
    elements: [{ ...validDoc.elements![0], width: Infinity }],
  };
  const badFrameFindings = validateTemplateDocument(badFrameDoc, cardTarget);
  assert.ok(badFrameFindings.some((f: { code: string }) => f.code === 'NON_FINITE_FRAME'));

  // Negative frame
  const negFrameDoc = {
    ...validDoc,
    elements: [{ ...validDoc.elements![0], height: -4 }],
  };
  const negFrameFindings = validateTemplateDocument(negFrameDoc, cardTarget);
  assert.ok(negFrameFindings.some((f: { code: string }) => f.code === 'NEGATIVE_FRAME'));
});

test('getTemplateAvailability - handles missing version, archived family, and draft status', () => {
  const cardTarget = createTemplateTarget({
    productId: 'card',
    variantId: 'vertical',
    mode: null,
    shape: null,
  });

  const templateBase = {
    id: 'tmpl-1',
    status: 'published' as const,
    currentPublishedVersionId: 'ver-1',
    target: cardTarget,
  };

  const versionBase = {
    id: 'ver-1',
    templateId: 'tmpl-1',
    version: 1,
    target: cardTarget,
    dependencies: [
      { kind: 'font-face' as const, id: 'font-1', checksum: 'hash-font-1' },
      { kind: 'sticker' as const, id: 'stk-1', checksum: 'hash-stk-1' },
    ],
  };

  const healthyDeps: TemplateAvailabilityDependencies = {
    lookup: new Map([
      [
        'font-face:font-1',
        {
          id: 'font-1',
          kind: 'font-face',
          status: 'published',
          checksum: 'hash-font-1',
          familyStatus: 'published',
        },
      ],
      [
        'sticker:stk-1',
        {
          id: 'stk-1',
          kind: 'sticker',
          status: 'published',
          checksum: 'hash-stk-1',
        },
      ],
    ]),
    assetManifestHealthy: true,
  };

  // Healthy published template is available
  const available = getTemplateAvailability(templateBase, versionBase, healthyDeps);
  assert.equal(available.available, true);
  assert.equal(available.blockers.length, 0);

  // Archived template
  const archivedTmpl = { ...templateBase, status: 'archived' as const };
  const archivedResult = getTemplateAvailability(archivedTmpl, versionBase, healthyDeps);
  assert.equal(archivedResult.available, false);
  assert.ok(archivedResult.blockers.some((b: { code: string }) => b.code === 'TEMPLATE_ARCHIVED'));

  // Missing version
  const noVerResult = getTemplateAvailability(
    { ...templateBase, currentPublishedVersionId: null },
    null,
    healthyDeps,
  );
  assert.equal(noVerResult.available, false);
  assert.ok(noVerResult.blockers.some((b: { code: string }) => b.code === 'NO_PUBLISHED_VERSION'));

  // Archived font family blocks availability
  const archivedFamilyDeps: TemplateAvailabilityDependencies = {
    lookup: new Map([
      [
        'font-face:font-1',
        {
          id: 'font-1',
          kind: 'font-face',
          status: 'published',
          checksum: 'hash-font-1',
          familyStatus: 'archived',
        },
      ],
      [
        'sticker:stk-1',
        {
          id: 'stk-1',
          kind: 'sticker',
          status: 'published',
          checksum: 'hash-stk-1',
        },
      ],
    ]),
  };
  const archivedFamilyResult = getTemplateAvailability(templateBase, versionBase, archivedFamilyDeps);
  assert.equal(archivedFamilyResult.available, false);
  assert.ok(
    archivedFamilyResult.blockers.some(
      (b: { code: string; kind?: string }) => b.code === 'ARCHIVED_DEPENDENCY' && b.kind === 'font-family',
    ),
  );

  // Missing dependency
  const missingDepResult = getTemplateAvailability(templateBase, versionBase, {
    lookup: new Map(),
  });
  assert.equal(missingDepResult.available, false);
  assert.ok(missingDepResult.blockers.some((b: { code: string }) => b.code === 'MISSING_DEPENDENCY'));

  // Draft dependency
  const draftDepDeps: TemplateAvailabilityDependencies = {
    lookup: new Map([
      [
        'font-face:font-1',
        {
          id: 'font-1',
          kind: 'font-face',
          status: 'draft',
          checksum: 'hash-font-1',
          familyStatus: 'published',
        },
      ],
      [
        'sticker:stk-1',
        {
          id: 'stk-1',
          kind: 'sticker',
          status: 'published',
          checksum: 'hash-stk-1',
        },
      ],
    ]),
  };
  const draftDepResult = getTemplateAvailability(templateBase, versionBase, draftDepDeps);
  assert.equal(draftDepResult.available, false);
  assert.ok(draftDepResult.blockers.some((b: { code: string }) => b.code === 'UNPUBLISHED_DEPENDENCY'));
});

test('listAllSupportedTargetKeys - enumerates distinct valid target keys', () => {
  const keys = listAllSupportedTargetKeys();
  assert.ok(keys.length > 0);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('card:vertical:mode:none:shape:none:surfaces:front-105x148_inside-210x148_back-105x148'));
  assert.ok(keys.includes('wrapping:a1:mode:pattern:shape:none:surfaces:sheet-594x841'));
  assert.ok(keys.includes('sticker:fixed-shape:mode:none:shape:circle:surfaces:front-50x50'));
  assert.ok(keys.includes('notebook:standard:mode:none:shape:none:surfaces:front-148x210'));
});
