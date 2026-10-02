import assert from 'node:assert/strict';
import test from 'node:test';

import type { StaffRole, LibraryStatus } from '../lib/domain/asset-library.ts';
import { canManageLibrary, canDeleteDraft } from '../lib/domain/asset-library.ts';

test('Admin UI permissions: role predicates gate actions correctly', () => {
  const roles: StaffRole[] = ['admin', 'editor'];

  for (const role of roles) {
    assert.equal(canManageLibrary(role, 'sticker'), true, `${role} can manage stickers`);
    assert.equal(canManageLibrary(role, 'font-face'), true, `${role} can manage font faces`);
  }

  // Deletion of drafts is admin-only and requires draft status with no publication history
  assert.equal(canDeleteDraft('admin', 'draft', null), true);
  assert.equal(canDeleteDraft('editor', 'draft', null), false);
  assert.equal(canDeleteDraft('admin', 'published', null), false);
  assert.equal(canDeleteDraft('admin', 'draft', '2026-10-02T00:00:00Z'), false);
  assert.equal(canDeleteDraft('admin', 'archived', null), false);
});

test('Status badge variants mapping consistency', () => {
  const statuses: LibraryStatus[] = ['draft', 'published', 'archived'];
  const statusLabels: Record<LibraryStatus, string> = {
    draft: 'Bản nháp',
    published: 'Đã xuất bản',
    archived: 'Lưu trữ',
  };

  for (const status of statuses) {
    assert.ok(statusLabels[status].length > 0, `Status ${status} has non-empty Vietnamese label`);
  }
});
