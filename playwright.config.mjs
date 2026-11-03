import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Electron launch plus first paint is far slower than a page load.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  // One Electron process at a time: the app takes a single-instance lock and
  // every test shares the same vite dev server.
  workers: 1,
  // The suite logs in to a live homeserver, where Synapse login rate limiting is a real flake.
  retries: process.env.CI ? 1 : 0,
  // An explicit reporter replaces the default, so list stays for the CI log.
  reporter: [['list'], ['html']],
  // A trace captures the login POST body, which contains the password. Pin it off rather than
  // relying on the version default.
  trace: 'off',
  // cinny/vite.config.js binds 0.0.0.0 with fs.allow: ['..'], which is exposed on a shared
  // CI runner, so pin the dev server to loopback. The flag has to reach vite itself:
  // `npm run dev:vite -- --host` lands on sh's positional params, not on vite.
  // localhost is also the URL electron/main.js loads, so the page keeps that origin.
  webServer: {
    command: 'sh -c "cd cinny && npm start -- --host localhost"',
    url: 'http://localhost:38347',
  },
});
