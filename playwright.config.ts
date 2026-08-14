import { config as loadEnv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

loadEnv({ path: '.env.local', quiet: true });

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Specs that need a signed-in owner.
 *
 * One list, referenced by both the public projects' `testIgnore` and the admin
 * project's `testMatch`. Kept as a single constant because two hand-maintained
 * copies drift: a spec missing from `testIgnore` runs in the public projects
 * with no session and fails as if the feature were broken.
 */
const ADMIN_SPECS = [
  /accessibility-admin\.spec\.ts/,
  /admin\.spec\.ts/,
  /leads\.spec\.ts/,
  /media\.spec\.ts/,
  /navigation\.spec\.ts/,
  /portfolio\.spec\.ts/,
  /redirects\.spec\.ts/,
  /settings\.spec\.ts/,
  /users\.spec\.ts/,
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Signs in once; admin specs reuse the session. See tests/e2e/auth.setup.ts
    // for why per-test login is not viable.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      testIgnore: [...ADMIN_SPECS, /auth\.setup\.ts/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testIgnore: [...ADMIN_SPECS, /auth\.setup\.ts/],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'admin',
      testMatch: ADMIN_SPECS,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/e2e/.auth/admin.json',
      },
    },
  ],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    /**
     * Never reuse a server that happens to be listening.
     *
     * Playwright's default reuses one locally, which means a run can silently
     * test a build from an hour ago — and it also means the build command in
     * this config goes unexercised. Both bit us: the suite reported green
     * against stale code while `npm run build` here was failing outright.
     * A rebuild per run is worth a suite that cannot lie about what it tested.
     */
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
