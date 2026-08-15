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
  /contacts\.spec\.ts/,
  /leads\.spec\.ts/,
  /media\.spec\.ts/,
  /navigation\.spec\.ts/,
  /pipeline\.spec\.ts/,
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
    /**
     * The standalone server, not `next start`.
     *
     * Production runs `output: 'standalone'`, and that build needs `public/`
     * and `.next/static/` copied into it — a step `next start` does not need
     * and therefore never exercises. Testing the other server would leave the
     * deployed one unverified, which is how a site ships with every stylesheet
     * returning 404.
     *
     * Env goes through `webServer.env` rather than an inline `VAR=x` prefix,
     * which cmd.exe does not understand.
     *
     * HOSTNAME is 0.0.0.0, the same value railway.json uses, and that is not
     * incidental. Bound to a specific loopback address instead, the standalone
     * server answers a middleware rewrite with an absolute URL pointing at
     * `localhost` — which Next then treats as an external redirect, and `/`
     * 307-loops until the browser gives up. Binding the wildcard keeps the
     * rewrite relative. Tightening this to 127.0.0.1 would take the home page
     * down in production while every test still passed.
     */
    command: `npm run build && node .next/standalone/server.js`,
    env: { PORT: String(PORT), HOSTNAME: '0.0.0.0' },
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
