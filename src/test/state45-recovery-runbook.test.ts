import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const runbookPath = resolve(process.cwd(), 'docs/operations/state45-recovery-runbook.md');

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('State 45 recovery runbook contract', () => {
  it('documents every recovery domain and support-safe diagnostic boundary', async () => {
    const runbook = await readFile(runbookPath, 'utf8');

    for (const heading of [
      'Guest Project Recovery',
      'Cloud Autosave Recovery',
      'Draft Lease Recovery',
      'Order Submit Recovery',
      'Payment Report & Confirmation',
      'Production Artifact Generation',
      'Production Lifecycle Transitions',
      'Publish Recovery',
      'Migration & Upload Recovery',
      'Support-safe Diagnostics',
      'Manual QA Verification Checklist',
    ]) {
      assert.match(runbook, new RegExp(`^## ${escaped(heading)}$`, 'm'));
    }

    for (const required of [
      'IndexedDB',
      'blob ID',
      'quarantine',
      '3-project/30-day',
      'server revision',
      'base revision',
      'pending snapshot',
      'lease epoch',
      'explicit Admin takeover',
      'idempotency key',
      'never recreate blindly',
      'report_checkout_payment',
      'already_reported',
      'already_paid',
      'audit log',
      'claim_next_render_job',
      'expired lease',
      'immutable DesignVersion',
      'Admin-only',
      'frozen snapshot',
      'request-to-version',
      'historical Order economics',
      'proof-bound',
      'partial migration',
      'public Order code',
      'A7KF2',
      'signed URL',
      'PII',
    ]) {
      assert.match(runbook, new RegExp(escaped(required), 'i'), `missing required recovery term: ${required}`);
    }
  });

  it('defines exactly 18 executable manual QA scenarios with expected observables', async () => {
    const runbook = await readFile(runbookPath, 'utf8');
    const scenarios = [...runbook.matchAll(/^### QA-(\d{2}): (.+)$/gm)];

    assert.equal(scenarios.length, 18);
    assert.deepEqual(
      scenarios.map((match) => match[1]),
      Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(2, '0')),
    );

    const requiredScenarios = [
      'Guest save and reload',
      'Guest storage failure',
      'Authenticated autosave failure and reconnect',
      'Cross-device revision conflict',
      'Checkout refresh',
      'Checkout offline',
      'Order double-click',
      'Order committed with lost response',
      'Payment report committed with lost response',
      'Two Admins confirming payment',
      'Staff Draft refresh',
      'Two Staff Draft editors',
      'Renderer failure and retry',
      'Two Start Production attempts',
      'Partial local-project migration',
      'Partial Sticker upload',
      'Template Publish response-loss retry',
      'Commercial Publish concurrency',
    ];

    assert.deepEqual(scenarios.map((match) => match[2]), requiredScenarios);

    const scenarioBlocks = runbook.split(/^### QA-\d{2}: .+$/gm).slice(1);
    for (const [index, block] of scenarioBlocks.entries()) {
      for (const field of [
        '**Preconditions:**',
        '**Steps:**',
        '**Expected UI:**',
        '**Expected authoritative observable:**',
        '**Recovery/diagnostic check:**',
      ]) {
        assert.match(block, new RegExp(escaped(field)), `QA-${String(index + 1).padStart(2, '0')} missing ${field}`);
      }
    }
  });
});
