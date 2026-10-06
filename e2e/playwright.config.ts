import { defineConfig, devices } from 'playwright/test';
import { resolve } from 'node:path';

const isDev = process.env.PLAYWRIGHT_DEV === '1';
const artifactsDir = resolve(process.cwd(), '.superpowers/artifacts/e2e');

export default defineConfig({
  testDir: '.',
  outputDir: resolve(artifactsDir, 'test-results'),
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(artifactsDir, 'report'), open: 'never' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],
  webServer: {
    command: isDev ? 'pnpm dev' : 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      PORT: '3000',
      ENABLE_TEST_STAFF_BYPASS: '1',
      ...(isDev ? { NODE_ENV: process.env.NODE_ENV || 'development' } : {}),
    },
  },
});
