import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const GOLDEN_SPECS = [
  'guest-checkout.spec.ts',
  'admin-order-production.spec.ts',
  'staff-revision.spec.ts',
  'account-migration.spec.ts',
  'content-template.spec.ts',
  'commercial-versioning.spec.ts',
] as const;

const SEMANTIC_LOCATOR = /page\.getBy(?:Role|Label|Text)\(/;
const PLAYWRIGHT_IMPORT = /import\s+\{[^}]*\btest\b[^}]*\bexpect\b[^}]*\}\s+from\s+['"]playwright\/test['"]/s;
const REGISTERED_TEST = /\btest(?:\.describe)?\s*\(/;
const BACKEND_ASSERTION = /\b(?:supabase|database|backend)\b/i;

describe('State 45 Golden E2E contract', () => {
  for (const filename of GOLDEN_SPECS) {
    it(`${filename} registers a semantic Playwright journey with backend assertions`, async () => {
      const path = resolve(process.cwd(), 'e2e', 'golden', filename);
      const source = await readFile(path, 'utf8');

      assert.match(source, PLAYWRIGHT_IMPORT, `${filename} must import test and expect from playwright/test`);
      assert.match(source, REGISTERED_TEST, `${filename} must register a Playwright test or describe block`);
      assert.match(source, SEMANTIC_LOCATOR, `${filename} must use role, label, or text locators`);
      assert.match(source, BACKEND_ASSERTION, `${filename} must make backend/database assertions`);
      assert.doesNotMatch(source, /\btest\.(?:skip|only|fixme)\s*\(/, `${filename} must run as part of the full Golden suite`);
      assert.doesNotMatch(source, /\bTODO\b|placeholder|not implemented/i, `${filename} must not contain unfinished behavior`);
    });
  }
});
