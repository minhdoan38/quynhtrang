import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { StaffIdentity } from '../lib/domain/order.ts';
import { AdminCatalogRepository } from '../lib/repositories/admin-catalog-repository.ts';
import {
  updateProductMetadata,
  enableSupportedVariant,
  activateProduct,
  archiveProduct,
  activateVariant,
  archiveVariant,
} from '../lib/services/admin-product-catalog.ts';
import {
  createOrLoadCommercialDraft,
  saveCommercialDraft,
  publishProductCommercialConfig,
} from '../lib/services/commercial-config-service.ts';
import { confirmOrderPayment } from '../lib/services/admin-order-operations.ts';

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

function setupSeededRepo(): AdminCatalogRepository {
  const repo = new AdminCatalogRepository(null);
  repo.seedProduct({
    id: 'card',
    slug: 'card',
    name: 'Thiệp',
    productType: 'card',
    status: 'draft',
    revision: 1,
    currentCommercialConfigVersionId: 'ver-1',
  });
  repo.seedVariant({
    id: 'horizontal',
    productId: 'card',
    name: 'Thiệp Ngang',
    price: 29000,
    status: 'active',
    definitionKey: 'card:horizontal',
    revision: 1,
  });
  repo.seedCommercialVersion({
    id: 'ver-1',
    productId: 'card',
    versionNumber: 1,
    currency: 'VND',
    paymentPolicy: { kind: 'full_payment' },
    variantRules: [
      {
        variantId: 'horizontal',
        minimumQuantity: 1,
        quantityStep: 1,
        maximumQuantity: 100,
        tiers: [{ minimumQuantity: 1, unitPrice: 29000 }],
      },
    ],
  });
  return repo;
}

describe('State 44 RBAC and Access Boundary Invariants', () => {
  describe('Editor role mutations rejected at service layer', () => {
    it('editor cannot update product metadata', async () => {
      const editor = createEditor();
      const repo = setupSeededRepo();

      const result = await updateProductMetadata('card', 1, { name: 'Editor Name' }, { staff: editor, repo });
      assert.equal(result.ok, false);
      assert.equal(result.code, 'FORBIDDEN');
    });

    it('editor cannot enable supported variant', async () => {
      const editor = createEditor();
      const repo = setupSeededRepo();

      const result = await enableSupportedVariant('card', 'card:vertical', 1, { staff: editor, repo });
      assert.equal(result.ok, false);
      assert.equal(result.code, 'FORBIDDEN');
    });

    it('editor cannot activate or archive products', async () => {
      const editor = createEditor();
      const repo = setupSeededRepo();

      const activateRes = await activateProduct('card', 1, { staff: editor, repo });
      assert.equal(activateRes.ok, false);
      assert.equal(activateRes.code, 'FORBIDDEN');

      const archiveRes = await archiveProduct('card', 1, { staff: editor, repo });
      assert.equal(archiveRes.ok, false);
      assert.equal(archiveRes.code, 'FORBIDDEN');
    });

    it('editor cannot activate or archive variants', async () => {
      const editor = createEditor();
      const repo = setupSeededRepo();

      const activateRes = await activateVariant('horizontal', 1, { staff: editor, repo });
      assert.equal(activateRes.ok, false);
      assert.equal(activateRes.code, 'FORBIDDEN');

      const archiveRes = await archiveVariant('horizontal', 1, { staff: editor, repo });
      assert.equal(archiveRes.ok, false);
      assert.equal(archiveRes.code, 'FORBIDDEN');
    });

    it('editor cannot create or load commercial draft', async () => {
      const editor = createEditor();
      const repo = setupSeededRepo();

      await assert.rejects(
        () => createOrLoadCommercialDraft('card', editor.userId, { staff: editor, repo }),
        /FORBIDDEN/,
      );
    });

    it('editor cannot save commercial draft', async () => {
      const editor = createEditor();
      const repo = setupSeededRepo();

      await assert.rejects(
        () =>
          saveCommercialDraft(
            {
              draftId: 'draft-card',
              expectedRevision: 1,
              payload: {
                currency: 'VND',
                paymentPolicy: { kind: 'full_payment' },
                variantRules: [],
              },
              requestId: 'req-editor',
            },
            { staff: editor, repo },
          ),
        /FORBIDDEN/,
      );
    });

    it('editor cannot publish product commercial config', async () => {
      const editor = createEditor();
      const repo = setupSeededRepo();

      await assert.rejects(
        () =>
          publishProductCommercialConfig(
            {
              productId: 'card',
              expectedDraftRevision: 1,
              expectedProductRevision: 1,
              requestId: 'req-editor-pub',
            },
            { staff: editor, repo },
          ),
        /FORBIDDEN/,
      );
    });

    it('editor cannot confirm order payment', async () => {
      const editor = createEditor();
      const fakeSupabase = {} as SupabaseClient;

      const result = await confirmOrderPayment(
        { supabase: fakeSupabase, staff: editor },
        { orderId: 'ord-test', expectedState: 'pending_payment', purpose: 'checkout_deposit' },
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'forbidden');
    });
  });

  describe('Admin role operations succeed at service layer', () => {
    it('admin can perform metadata updates, draft lifecycle, and status changes', async () => {
      const admin = createAdmin();
      const repo = setupSeededRepo();

      // 1. Update metadata
      const metaRes = await updateProductMetadata('card', 1, { name: 'Thiệp Cưới Sang Trọng' }, { staff: admin, repo });
      assert.equal(metaRes.ok, true);
      assert.equal(metaRes.revision, 2);

      // 2. Draft lifecycle
      const draft = await createOrLoadCommercialDraft('card', admin.userId, { staff: admin, repo });
      assert.ok(draft.id);

      const savedDraft = await saveCommercialDraft(
        {
          draftId: draft.id,
          expectedRevision: draft.revision,
          payload: {
            currency: 'VND',
            paymentPolicy: { kind: 'full_payment' },
            variantRules: [
              {
                variantId: 'horizontal',
                minimumQuantity: 1,
                quantityStep: 1,
                maximumQuantity: 100,
                tiers: [{ minimumQuantity: 1, unitPrice: 32000 }],
              },
            ],
          },
          requestId: 'req-admin-save',
        },
        { staff: admin, repo },
      );
      assert.equal(savedDraft.revision, 2);

      const published = await publishProductCommercialConfig(
        {
          productId: 'card',
          expectedDraftRevision: savedDraft.revision,
          expectedProductRevision: 2,
          requestId: 'req-admin-pub',
        },
        { staff: admin, repo },
      );
      assert.equal(published.versionNumber, 2);

      // 3. Status changes
      const activeRes = await activateProduct('card', 3, { staff: admin, repo });
      assert.equal(activeRes.ok, true);
      assert.equal(activeRes.status, 'active');
    });
  });

  describe('Non-staff and anonymous role write denials', () => {
    it('rejects mutations when staff identity has invalid or non-staff role', async () => {
      const nonStaff = {
        userId: '44000000-0000-0000-0000-0000000000c1',
        role: 'customer' as unknown as StaffIdentity['role'],
        email: 'customer@test.com',
      };
      const repo = setupSeededRepo();

      const metaRes = await updateProductMetadata('card', 1, { name: 'Hacker Edit' }, { staff: nonStaff, repo });
      assert.equal(metaRes.ok, false);
      assert.equal(metaRes.code, 'FORBIDDEN');

      const varRes = await enableSupportedVariant('card', 'card:vertical', 1, { staff: nonStaff, repo });
      assert.equal(varRes.ok, false);
      assert.equal(varRes.code, 'FORBIDDEN');

      const prodRes = await activateProduct('card', 1, { staff: nonStaff, repo });
      assert.equal(prodRes.ok, false);
      assert.equal(prodRes.code, 'FORBIDDEN');

      await assert.rejects(
        () => createOrLoadCommercialDraft('card', nonStaff.userId, { staff: nonStaff, repo }),
        /FORBIDDEN/,
      );

      const fakeSupabase = {} as SupabaseClient;
      const paymentRes = await confirmOrderPayment(
        { supabase: fakeSupabase, staff: nonStaff },
        { orderId: 'ord-1', expectedState: 'pending_payment' },
      );
      assert.equal(paymentRes.ok, false);
      assert.equal(paymentRes.code, 'forbidden');
    });
  });

  describe('SQL RPC and schema layer authorization definitions', () => {
    it('migration files strictly revoke direct table writes and enforce admin role in mutation RPCs', () => {
      const mig10Path = resolve(process.cwd(), 'supabase/migrations/0010_state44_catalog_commercial.sql');
      const mig14Path = resolve(process.cwd(), 'supabase/migrations/0014_state44_catalog_operations.sql');
      const mig16Path = resolve(process.cwd(), 'supabase/migrations/0016_state44_admin_catalog_ui.sql');

      const mig10 = readFileSync(mig10Path, 'utf8');
      const mig14 = readFileSync(mig14Path, 'utf8');
      const mig16 = readFileSync(mig16Path, 'utf8');

      // Table write revocations
      assert.match(mig10, /revoke insert, update, delete on table\s+public\.products/i);
      assert.match(mig10, /revoke select on table public\.product_commercial_drafts from anon/i);

      // RPC role checks in migration 0014
      assert.match(mig14, /select role into v_role from public\.staff_roles where user_id = v_actor/);
      assert.match(mig14, /if v_role <> 'admin' then/);

      // RPC role checks in migration 0016
      assert.match(mig16, /select role into v_role from public\.staff_roles where user_id = auth\.uid\(\)/);
      assert.match(mig16, /if v_role is distinct from 'admin' then return jsonb_build_object\('ok', false, 'code', 'FORBIDDEN'\)/);
    });
  });
});
