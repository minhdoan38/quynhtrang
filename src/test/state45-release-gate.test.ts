import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

describe('State 45 release gate contract', () => {
  it('defines reproducible lint, E2E, smoke, and release gate scripts', async () => {
    const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    assert.equal(pkg.scripts?.lint, 'eslint src scripts e2e');
    assert.equal(
      pkg.scripts?.['test:e2e'],
      'playwright test e2e/golden e2e/failure --config=e2e/playwright.config.ts --project=chromium',
    );
    assert.equal(
      pkg.scripts?.['test:smoke'],
      'playwright test e2e/golden/guest-checkout.spec.ts e2e/failure/checkout-unknown-outcome.spec.ts --config=e2e/playwright.config.ts --project=mobile-chromium --project=mobile-webkit',
    );
    assert.equal(
      pkg.scripts?.gate,
      'pnpm run lint && pnpm run typecheck && pnpm test && pnpm run build',
    );
  });

  it('defines every required GitHub release gate stage', async () => {
    const workflowPath = '.github/workflows/state45-release-gate.yml';
    await access(resolve(root, workflowPath));
    const workflow = await readFile(resolve(root, workflowPath), 'utf8');

    for (const required of [
      'actions/checkout@',
      'pnpm/action-setup@',
      'pnpm install --frozen-lockfile',
      'pnpm run lint',
      'pnpm run typecheck',
      'pnpm test',
      'pnpm run build',
      'node --experimental-strip-types scripts/state45-production-smoke.ts',
      'supabase/tests/state45_integrity.sql',
      'supabase/tests/state45_security.sql',
      'pnpm run test:e2e',
      'pnpm run test:smoke',
    ]) {
      assert.match(workflow, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(workflow, /SUPABASE_DB_URL/);
    assert.match(workflow, /if:\s*\$\{\{[^}]*SUPABASE_DB_URL/);
  });

  it('documents State 45 migrations and SQL tests in the README', async () => {
    const readme = await readFile(resolve(root, 'README.md'), 'utf8');

    for (const path of [
      '0019_state45_order_recovery.sql',
      '0020_state45_fulfillment_render_recovery.sql',
      '0021_state45_publish_replay.sql',
      '0022_state45_integrity_constraints.sql',
      'supabase/tests/state45_integrity.sql',
      'supabase/tests/state45_security.sql',
    ]) {
      assert.match(readme, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });
});
