import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { StaffIdentity } from '../lib/domain/order.ts';
import {
  activateProduct,
  archiveProduct,
  activateVariant,
  archiveVariant,
  type MutationResult,
} from '../lib/services/admin-product-catalog.ts';
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

describe('Admin Product Catalog Lifecycle Service', () => {
  it('activates product when commercial config exists and at least one active variant with valid definition_key exists', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    // Mock initial data in repo
    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
      currentCommercialConfigVersionId: 'comm-ver-1',
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

    const result = await activateProduct('card', 1, { staff: admin, repo });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'active');
      assert.equal(result.revision, 2);
    }
  });

  it('rejects product activation if no commercial config exists', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
      currentCommercialConfigVersionId: null,
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

    const result = await activateProduct('card', 1, { staff: admin, repo });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'MISSING_COMMERCIAL_CONFIG');
    }
  });

  it('rejects product activation if no active variant exists', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
      currentCommercialConfigVersionId: 'comm-ver-1',
    });
    repo.seedVariant({
      id: 'horizontal',
      productId: 'card',
      name: 'Ngang',
      price: 29000,
      status: 'draft',
      definitionKey: 'card:horizontal',
      revision: 1,
    });

    const result = await activateProduct('card', 1, { staff: admin, repo });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'NO_ACTIVE_VARIANTS');
    }
  });

  it('rejects product activation on stale expectedRevision conflict', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 2,
      currentCommercialConfigVersionId: 'comm-ver-1',
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

    const result = await activateProduct('card', 1, { staff: admin, repo });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'REVISION_CONFLICT');
    }
  });

  it('rejects product activation if caller is not an admin', async () => {
    const editor = createEditor();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'draft',
      revision: 1,
      currentCommercialConfigVersionId: 'comm-ver-1',
    });

    const result = await activateProduct('card', 1, { staff: editor, repo });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'FORBIDDEN');
    }
  });

  it('activates variant when definition_key is registered in product definition registry', async () => {
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
      status: 'draft',
      definitionKey: 'card:horizontal',
      revision: 1,
    });

    const result = await activateVariant('horizontal', 1, { staff: admin, repo });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'active');
      assert.equal(result.revision, 2);
    }
  });

  it('rejects variant activation when definition_key is missing or unknown', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedVariant({
      id: 'custom-var',
      productId: 'card',
      name: 'Không rõ',
      price: 29000,
      status: 'draft',
      definitionKey: null,
      revision: 1,
    });

    const missingResult = await activateVariant('custom-var', 1, { staff: admin, repo });
    assert.equal(missingResult.ok, false);
    if (!missingResult.ok) {
      assert.equal(missingResult.code, 'MISSING_DEFINITION_KEY');
    }

    repo.seedVariant({
      id: 'unknown-var',
      productId: 'card',
      name: 'Không tồn tại',
      price: 29000,
      status: 'draft',
      definitionKey: 'card:unknown-key',
      revision: 1,
    });

    const unknownResult = await activateVariant('unknown-var', 1, { staff: admin, repo });
    assert.equal(unknownResult.ok, false);
    if (!unknownResult.ok) {
      assert.equal(unknownResult.code, 'UNKNOWN_DEFINITION_KEY');
    }
  });

  it('rejects archiving the last active variant of an active product with actionable blocker', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'active',
      revision: 1,
      currentCommercialConfigVersionId: 'comm-ver-1',
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

    const result = await archiveVariant('horizontal', 1, { staff: admin, repo });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'LAST_ACTIVE_VARIANT');
      assert.match(result.message ?? '', /Không thể lưu trữ biến thể đang hoạt động cuối cùng của sản phẩm đang bán/);
    }
  });

  it('archives variant when other active variants remain for active product', async () => {
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

    const result = await archiveVariant('horizontal', 1, { staff: admin, repo });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'archived');
      assert.equal(result.revision, 2);
    }
  });

  it('archives product and increments revision', async () => {
    const admin = createAdmin();
    const repo = new AdminCatalogRepository(null);

    repo.seedProduct({
      id: 'card',
      slug: 'card',
      name: 'Thiệp',
      productType: 'card',
      status: 'active',
      revision: 3,
    });

    const result = await archiveProduct('card', 3, { staff: admin, repo });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, 'archived');
      assert.equal(result.revision, 4);
    }
  });
});
