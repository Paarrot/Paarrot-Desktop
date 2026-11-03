import { test, expect, _electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOMESERVER = process.env.E2E_HOMESERVER ?? 'ruv.wtf';
const USER = process.env.E2E_USER ?? 'giteaci';
const PASSWORD = process.env.E2E_PASSWORD;

let app;
let page;
let logs = [];
let profile;
let crashed = false;

// ServerPicker gives its input no name or test id, so position is the only handle on it;
// this breaks if the form ever gains a field before the ones below.
const serverInput = () => page.locator('input').first();
const usernameInput = () => page.locator('input[name="usernameInput"]');
const passwordInput = () => page.locator('input[name="passwordInput"]');
const submitButton = () => page.locator('button[type="submit"]');

async function expectLoginForm() {
  await expect(serverInput()).toBeVisible();
  await expect(usernameInput()).toBeVisible();
  await expect(passwordInput()).toBeVisible();
  await expect(submitButton()).toBeVisible();
}

async function chooseServer(server) {
  await serverInput().fill(server);
  // The server field commits on Enter, which re-runs discovery and reloads the auth flows.
  await serverInput().press('Enter');
  // fill() does not prove the value stuck; a cancelled debounce would keep matrix.org.
  await expect(serverInput()).toHaveValue(server);
  await expectLoginForm();
}

async function submitLogin(username, password) {
  await usernameInput().fill(username);
  await passwordInput().fill(password);
  await submitButton().click();
}

test.beforeEach(async () => {
  logs = [];
  crashed = false;

  if (!PASSWORD) {
    throw new Error('E2E_PASSWORD is not set. Export it, or add it as the CI secret.');
  }

  // Fresh profile per run. electron/main.js takes a single-instance lock keyed to
  // the user data dir, so a shared profile collides with a running Paarrot.
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'paarrot-e2e-'));
  app = await _electron.launch({ args: ['.', `--user-data-dir=${profile}`] });

  app.on('console', (msg) => logs.push(`[main] ${msg.type()}: ${msg.text()}`));

  page = await app.firstWindow();
  // main.js opens DevTools in dev mode, and that window can be the first one registered.
  while (page.url().startsWith('devtools://')) {
    // Recorded so a hang here names which windows existed instead of reporting a bare timeout.
    logs.push(`[window] ${page.url()}`);
    page = app.windows().find((w) => !w.url().startsWith('devtools://'))
      ?? await new Promise((resolve) => app.once('window', resolve));
  }
  page.on('console', (msg) => logs.push(`[renderer] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[renderer] pageerror: ${err}`));
  // crash is render-process-gone, so it does not fire on the MatrixError or the ServiceWorker error.
  page.on('crash', () => {
    crashed = true;
    logs.push('[renderer] page crashed');
  });

  await chooseServer(HOMESERVER);
});

// Config-based screenshots do not fire for a page taken from app.firstWindow(), and console
// capture is not covered by config at all, so this hook stays manual.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    // Console first: a failed launch has no app and no page, so this is the only artifact that
    // path can produce, and it is empty by construction because no handler is attached before
    // launch — the failure message in the report is the diagnosis there. A crashed page produces
    // no screenshot; the crash line in the console names it.
    await testInfo.attach('console.log', { body: logs.join('\n'), contentType: 'text/plain' });
    if (page && !page.isClosed()) {
      // screenshot() throws on a crashed page, which would mask the original failure.
      const shot = await page.screenshot().catch(() => null);
      if (shot) await testInfo.attach('failure.png', { body: shot, contentType: 'image/png' });
    }
  }

  if (app) {
    await app
      .close()
      // main.js preventDefault()s window close to minimise to tray, so close can hang.
      .catch(() => app.process().kill('SIGTERM'));
  }

  // Reachable on launch failure, so the temp profile does not leak.
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
});

async function expectAuthenticated() {
  // Login complete reloads into the client shell, which lands on the last active path
  // (state/lastActivePath.ts) or the inbox, so assert a shell route rather than any URL.
  await expect(page).toHaveURL(/#\/(inbox|home|room|space)/);

  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('currentSessionUserId') ?? 'null')))
    .toBe(`@${USER}:${HOMESERVER}`);

  // A truthy accessToken only proves a string exists, so prove it authenticates. Only the
  // status is asserted, so a failure cannot put a live token into the CI log or the report.
  await expect
    .poll(async () => {
      const token = await page.evaluate(() => JSON.parse(localStorage.getItem('matrixSessions') ?? '[]')[0]?.accessToken);
      if (!token) return 0;
      // /versions and /account 404 on ruv.wtf; /capabilities exists and requires a valid token.
      const res = await fetch(`https://${HOMESERVER}/_matrix/client/v3/capabilities`, { headers: { Authorization: `Bearer ${token}` } });
      return res.status;
    })
    .toBe(200);
}

test('test account can log in and reaches the authenticated app', async () => {
  await submitLogin(USER, PASSWORD);
  await expectAuthenticated();
});

test('failed login reports an error and keeps the renderer alive', async () => {
  await submitLogin(USER, 'not-the-password');

  // A rate-limited run renders LoginError.RateLimited instead of the wrong-password message,
  // so accept both branches rather than asserting one exact string.
  await expect(page.getByText(/Invalid Username or Password\.|rate-limited by server/)).toBeVisible();

  // Asserted before the form check: on a crashed page the locator throws TargetClosedError,
  // which names the wrong thing. Pageerrors go into the artifact but are not asserted — the
  // failed login itself produces MatrixError, and dev mode produces a ServiceWorker registration
  // error. No second login here: every run costs Synapse rc_login budget, and the re-login was
  // the main flake source.
  await expect(crashed).toBe(false);
  await expect(usernameInput()).toBeVisible();
});
