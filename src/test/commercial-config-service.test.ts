import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { StaffIdentity } from '../lib/domain/order.ts';
import type { CommercialVariantRule } from '../lib/domain/commercial-config.ts';
import {
  createOrLoadCommercialDraft,
  saveCommercialDraft,
  publishProductCommercialConfig,
  type CommercialDraft,
  type SaveCommercialDraftInput,
  type PublishCommercialConfigInput,
  type PublishedCommercialConfig,
} from '../lib/services/commercial-config-service.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';

function createAdmin(userId = '44000000-0000-0000-0000-0000000000a1'): StaffIdentity {
  return {
    userId,
    role: 'admin',
    email: 'admin@quynhtrang.test',
  };
}

function createEditor(userId = '44000000-0000-0000-0000-0000000000e1'): StaffIdentity {
  return {
    userId,
    role: 'editor',
    email: 'editor@quynhtrang.test',
  };
}

function validVariantRules(): CommercialVariantRule[] {
  return [
    {
      variantId: 'horizontal',
      minimumQuantity: 1,
      quantityStep: 1,
      maximumQuantity: 100,
      tiers: [
        { minimumQuantity: 1, unitPrice: 29000 },
        { minimumQuantity: 10, unitPrice: 25000 },
      ],
    },
  ];
}

describe('Commercial Config Service', () => {
  it('creates initial draft when no draft exists, copying base version if present', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'active',
      revision: 1,
      currentCommercialConfigVersionId: 'ver-1',
    });
    repo.seedCommercialVersion({
      id: 'ver-1',
      productId: 'card',
      versionNumber: 1,
      currency: 'VND',
      paymentPolicy: { kind: 'full_payment' },
      variantRules: validVariantRules(),
    });

    const draft = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
    assert.ok(draft.id);
    assert.equal(draft.productId, 'card');
    assert.equal(draft.baseVersionId, 'ver-1');
    assert.equal(draft.revision, 1);
    assert.equal(draft.payload.currency, 'VND');
    assert.deepEqual(draft.payload.paymentPolicy, { kind: 'full_payment' });
  });

  it('loads existing draft if one is already open', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'active',
      revision: 1,
    });
    repo.seedCommercialDraft({
      id: 'draft-card-1',
      productId: 'card',
      baseVersionId: null,
      revision: 3,
      payload: {
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: validVariantRules(),
      },
      authorId: admin.userId,
    });

    const draft = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
    assert.equal(draft.id, 'draft-card-1');
    assert.equal(draft.revision, 3);
  });

  it('saves commercial draft and increments draft revision', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
    });
    repo.seedCommercialDraft({
      id: 'draft-card-1',
      productId: 'card',
      baseVersionId: null,
      revision: 1,
      payload: {
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: validVariantRules(),
      },
      authorId: admin.userId,
    });

    const saveInput: SaveCommercialDraftInput = {
      draftId: 'draft-card-1',
      expectedRevision: 1,
      payload: {
        currency: 'VND',
        paymentPolicy: { kind: 'fixed_deposit', depositAmount: 20000 },
        variantRules: validVariantRules(),
      },
      requestId: 'req-save-1',
    };

    const updated = await saveCommercialDraft(saveInput, { staff: admin, repo });
    assert.equal(updated.revision, 2);
    assert.deepEqual(updated.payload.paymentPolicy, { kind: 'fixed_deposit', depositAmount: 20000 });
  });

  it('rejects saving commercial draft on stale draft revision conflict', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
    });
    repo.seedCommercialDraft({
      id: 'draft-card-1',
      productId: 'card',
      baseVersionId: null,
      revision: 2, // current is 2
      payload: {
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: validVariantRules(),
      },
      authorId: admin.userId,
    });

    const saveInput: SaveCommercialDraftInput = {
      draftId: 'draft-card-1',
      expectedRevision: 1, // expects 1
      payload: {
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: validVariantRules(),
      },
      requestId: 'req-save-stale',
    };

    await assert.rejects(
      () => saveCommercialDraft(saveInput, { staff: admin, repo }),
      /REVISION_CONFLICT/,
    );
  });

  it('publishes product commercial config atomically, closing draft and creating immutable version', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
    });
    repo.seedVariant({
      id: 'horizontal',
      productId: 'card',
      name: 'Ngang',
      price: 29000,
      status: 'active',
      definitionKey: 'card:horizontal',
      revision: 1,
    });
    repo.seedCommercialDraft({
      id: 'draft-card-1',
      productId: 'card',
      baseVersionId: null,
      revision: 2,
      payload: {
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: validVariantRules(),
      },
      authorId: admin.userId,
    });

    const publishInput: PublishCommercialConfigInput = {
      productId: 'card',
      expectedDraftRevision: 2,
      expectedProductRevision: 1,
      requestId: 'pub-req-1',
    };

    const published = await publishProductCommercialConfig(publishInput, { staff: admin, repo });
    assert.equal(published.productId, 'card');
    assert.equal(published.versionNumber, 1);
    assert.equal(published.currency, 'VND');

    // Product's current_commercial_config_version_id is set
    const product = repo.getProduct('card');
    assert.equal(product?.currentCommercialConfigVersionId, published.id);
    assert.equal(product?.revision, 2);

    // Draft is closed
    const draft = repo.getCommercialDraft('card');
    assert.equal(draft, null);

    // Exactly one audit event recorded
    const events = repo.getAssetEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event, 'commercial_config_published');
  });

  it('rejects publishing when commercial validation fails (e.g. missing active variant rule)', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
    });
    repo.seedVariant({
      id: 'horizontal',
      productId: 'card',
      name: 'Ngang',
      price: 29000,
      status: 'active',
      definitionKey: 'card:horizontal',
      revision: 1,
    });
    repo.seedVariant({
      id: 'vertical',
      productId: 'card',
      name: 'Đứng',
      price: 29000,
      status: 'active',
      definitionKey: 'card:vertical',
      revision: 1,
    });
    // Draft only has rules for 'horizontal', missing 'vertical'!
    repo.seedCommercialDraft({
      id: 'draft-card-1',
      productId: 'card',
      baseVersionId: null,
      revision: 1,
      payload: {
        currency: 'VND',
        paymentPolicy: { kind: 'full_payment' },
        variantRules: validVariantRules(), // only horizontal
      },
      authorId: admin.userId,
    });

    const publishInput: PublishCommercialConfigInput = {
      productId: 'card',
      expectedDraftRevision: 1,
      expectedProductRevision: 1,
      requestId: 'pub-req-fail',
    };

    await assert.rejects(
      () => publishProductCommercialConfig(publishInput, { staff: admin, repo }),
      /COMMERCIAL_CONFIG_INVALID/,
    );
  });

  it('rejects publishing by non-admin staff', async () => {
    const editor = createEditor();
    const repo = new AdminCatalogRepository(null);

    const publishInput: PublishCommercialConfigInput = {
      productId: 'card',
      expectedDraftRevision: 1,
      expectedProductRevision: 1,
      requestId: 'pub-req-editor',
    };

    await assert.rejects(
      () => publishProductCommercialConfig(publishInput, { staff: editor, repo }),
      /FORBIDDEN/,
    );
  });
});
