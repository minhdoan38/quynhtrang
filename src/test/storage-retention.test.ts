import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRecentProjects,
  RECENT_PROJECT_RETENTION_MS,
  type RecentProject,
} from '../lib/storage.ts';

const RECENT_PROJECTS_KEY = 'quynhtrang-recent-projects-v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 30);

const baseProject = {
  productId: 'card' as const,
  variantId: 'folded-a6',
  templateId: null,
  text: '',
  color: '#000000',
  backgroundColor: '#ffffff',
  image: null,
  productOptions: {},
};

function setupLocalStorage(projects: RecentProject[]) {
  const values = new Map([[RECENT_PROJECTS_KEY, JSON.stringify(projects)]]);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
    },
  });
  return values;
}

test('exports 30-day retention duration constant', () => {
  assert.equal(RECENT_PROJECT_RETENTION_MS, 30 * DAY_MS);
});

test('keeps projects updated within or exactly at the 30-day retention boundary', () => {
  setupLocalStorage([
    { ...baseProject, id: 'fresh', updatedAt: NOW - 29 * DAY_MS },
    { ...baseProject, id: 'boundary', updatedAt: NOW - 30 * DAY_MS },
  ]);

  assert.deepEqual(getRecentProjects(NOW).map(({ id }) => id), ['fresh', 'boundary']);
});

test('prunes projects older than 30 days on read', () => {
  setupLocalStorage([
    { ...baseProject, id: 'expired', updatedAt: NOW - 30 * DAY_MS - 1 },
    { ...baseProject, id: 'fresh', updatedAt: NOW - DAY_MS },
  ]);

  assert.deepEqual(getRecentProjects(NOW).map(({ id }) => id), ['fresh']);
});

test('returns no more than three retained projects', () => {
  setupLocalStorage([
    { ...baseProject, id: 'one', updatedAt: NOW - DAY_MS },
    { ...baseProject, id: 'two', updatedAt: NOW - 2 * DAY_MS },
    { ...baseProject, id: 'three', updatedAt: NOW - 3 * DAY_MS },
    { ...baseProject, id: 'four', updatedAt: NOW - 4 * DAY_MS },
  ]);

  assert.deepEqual(getRecentProjects(NOW).map(({ id }) => id), ['one', 'two', 'three']);
});

test('writes the pruned project list back to localStorage', () => {
  const values = setupLocalStorage([
    { ...baseProject, id: 'fresh-one', updatedAt: NOW - DAY_MS },
    { ...baseProject, id: 'expired', updatedAt: NOW - 31 * DAY_MS },
    { ...baseProject, id: 'fresh-two', updatedAt: NOW - 2 * DAY_MS },
  ]);

  getRecentProjects(NOW);

  const stored = JSON.parse(values.get(RECENT_PROJECTS_KEY) ?? '[]') as RecentProject[];
  assert.deepEqual(stored.map(({ id }) => id), ['fresh-one', 'fresh-two']);
});
