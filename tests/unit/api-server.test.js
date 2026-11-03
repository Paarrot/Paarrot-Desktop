import { afterAll, beforeAll, expect, test } from 'vitest';

import PaarrotAPIServer from '../../electron/api-server.js';

const api = new PaarrotAPIServer(null);
let base;

beforeAll(async () => {
  // Port 0 lets the OS pick a free port, so the test never collides with a running Paarrot.
  await api.start(0);
  base = `http://127.0.0.1:${api.server.address().port}`;
});

afterAll(async () => {
  await api.stop();
});

test('GET /health reports the API server is up', async () => {
  const res = await fetch(`${base}/health`);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', app: 'Paarrot API', version: '1.0.0' });
});

test('unknown endpoint answers 404 with the endpoint list', async () => {
  const res = await fetch(`${base}/not-an-endpoint`);

  expect(res.status).toBe(404);

  const body = await res.json();
  expect(body.error).toBe('Endpoint not found');
  expect(body.availableEndpoints).toContain('GET /health');
});
