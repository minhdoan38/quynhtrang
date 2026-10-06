import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const FAILURE_SPECS = {
  'guest-persistence.spec.ts': [
    /simulateStorageWriteFailure/,
    /Chưa thể lưu/,
    /Đã lưu/,
    /editor|canvas/i,
  ],
  'autosave-conflict.spec.ts': [
    /simulateOffline|simulateRouteFailure/,
    /unsynced/,
    /revision/i,
    /Thiết kế đã được cập nhật ở nơi khác\./,
  ],
  'checkout-unknown-outcome.spec.ts': [
    /simulateOffline/,
    /simulateCommittedResponseDrop/,
    /idempotency/i,
    /orderCount|orders.*count|count.*orders/is,
  ],
  'payment-unknown-outcome.spec.ts': [
    /simulateCommittedResponseDrop/,
    /confirmer|confirmedBy/,
    /confirmedAt|originalTime/,
    /eventCount|events.*length|length.*events/is,
  ],
  'production-concurrency.spec.ts': [
    /Promise\.all/,
    /production_started/,
    /eventCount|events.*length|length.*events/is,
    /conflict|refreshed|in_production/i,
  ],
  'asset-upload-recovery.spec.ts': [
    /simulateRouteFailure/,
    /failed/i,
    /retry/i,
    /objectCount|objects.*length|length.*objects/is,
  ],
  'artifact-retry.spec.ts': [
    /renderer/i,
    /failed/,
    /blocked|cannot start|can't start/i,
    /ready/,
  ],
  'account-migration-recovery.spec.ts': [
    /migration/i,
    /logged|authenticated/i,
    /claimed/i,
    /duplicate|projectCount|projects.*length/is,
  ],
  'publish-replay.spec.ts': [
    /simulateCommittedResponseDrop/,
    /template/i,
    /commercial/i,
    /current.*(?:pointer|version)|current_.*version/is,
  ],
} as const;

const PLAYWRIGHT_IMPORT = /import\s+\{[^}]*\btest\b[^}]*\bexpect\b[^}]*\}\s+from\s+['"](?:@playwright\/test|playwright\/test)['"]/s;
const REGISTERED_TEST = /\btest(?:\.describe)?\s*\(/;
const BACKEND_ASSERTION = /\b(?:supabase|database|backend)\b/i;

describe('State 45 deliberate failure E2E contract', () => {
  it('declares exactly the nine required failure specs', () => {
    assert.deepEqual(Object.keys(FAILURE_SPECS), [
      'guest-persistence.spec.ts',
      'autosave-conflict.spec.ts',
      'checkout-unknown-outcome.spec.ts',
      'payment-unknown-outcome.spec.ts',
      'production-concurrency.spec.ts',
      'asset-upload-recovery.spec.ts',
      'artifact-retry.spec.ts',
      'account-migration-recovery.spec.ts',
      'publish-replay.spec.ts',
    ]);
  });

  for (const [filename, recoveryContracts] of Object.entries(FAILURE_SPECS)) {
    it(`${filename} registers Playwright recovery behavior and authoritative assertions`, async () => {
      const source = await readFile(resolve(process.cwd(), 'e2e', 'failure', filename), 'utf8');

      assert.match(source, PLAYWRIGHT_IMPORT, `${filename} must import Playwright test and expect`);
      assert.match(source, REGISTERED_TEST, `${filename} must register a Playwright test or describe block`);
      assert.match(source, BACKEND_ASSERTION, `${filename} must assert authoritative backend state`);
      for (const contract of recoveryContracts) {
        assert.match(source, contract, `${filename} is missing recovery evidence: ${contract}`);
      }
      assert.doesNotMatch(source, /[?&]forceError=true/i, `${filename} must use fault helpers, not production query switches`);
      assert.doesNotMatch(source, /\btest\.(?:skip|only|fixme)\s*\(/, `${filename} must run in the failure suite`);
      assert.doesNotMatch(source, /\bTODO\b|placeholder|not implemented/i, `${filename} must not contain unfinished behavior`);
    });
  }
});
