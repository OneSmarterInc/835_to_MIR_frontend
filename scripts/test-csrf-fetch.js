import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsrfFetch } from '../src/utils/csrfFetch.js';

const settings = { frontendOrigin: 'https://filex.example', backendUrl: 'https://api.example' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('cross-origin login bootstraps a token with cookies and sends the header', async () => {
  const calls = [];
  const fetch = createCsrfFetch(async (url, options) => {
    calls.push({ url, options });
    return String(url).endsWith('/user/') ? json({ csrf_token: 'masked' }) : json({ ok: true });
  }, settings);
  await fetch('https://api.example/admin-panel/api/auth/login/', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
  assert.equal(calls[0].url, 'https://api.example/accounts/api/user/');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[1].options.headers['x-csrftoken'], 'masked');
  assert.equal(calls[1].options.headers['content-type'], 'application/json');
  assert.equal(calls[1].options.body, '{}');
});

test('same-origin proxy and concurrent mutations share one bootstrap', async () => {
  let bootstraps = 0;
  const fetch = createCsrfFetch(async (url) => {
    if (String(url).endsWith('/user/')) { bootstraps++; return json({ csrf_token: 'token' }); }
    return json({});
  }, settings);
  await Promise.all([fetch('/api/a/', { method: 'POST' }), fetch('/api/b/', { method: 'DELETE' })]);
  assert.equal(bootstraps, 1);
});

test('login rotation forces a fresh token for the next mutation', async () => {
  let bootstraps = 0;
  const used = [];
  const fetch = createCsrfFetch(async (url, options) => {
    if (String(url).endsWith('/user/')) return json({ csrf_token: `token${++bootstraps}` });
    used.push(options.headers['x-csrftoken']);
    return json({});
  }, settings);
  await fetch('/accounts/api/login/', { method: 'POST' });
  await fetch('/accounts/api/verify-2fa/', { method: 'POST' });
  assert.deepEqual(used, ['token1', 'token2']);
});

test('safe reads and third-party writes never bootstrap or receive tokens', async () => {
  const calls = [];
  const fetch = createCsrfFetch(async (...args) => { calls.push(args); return json({}); }, settings);
  await fetch('/api/list/');
  await fetch('https://untrusted.example/api/upload/', { method: 'POST' });
  assert.equal(calls.length, 2);
  for (const [, options] of calls) assert.equal(options.headers, undefined);
});

test('Request headers and FormData survive, explicit token is preserved', async () => {
  let sent;
  const fetch = createCsrfFetch(async (input, options) => { sent = { input, options }; return json({}); }, settings);
  const body = new FormData(); body.append('name', 'file');
  const request = new Request('https://api.example/api/upload/', { method: 'POST', body, headers: { 'X-CSRFToken': 'explicit' } });
  await fetch(request);
  assert.equal(sent.input, request);
  assert.equal(sent.options.headers['x-csrftoken'], 'explicit');
});

test('CSRF rejection is not replayed and invalidates the cached token', async () => {
  let bootstraps = 0, writes = 0;
  const fetch = createCsrfFetch(async (url) => {
    if (String(url).endsWith('/user/')) return json({ csrf_token: `token${++bootstraps}` });
    writes++; return json({ error: 'CSRF Failed: incorrect token' }, 403);
  }, settings);
  assert.equal((await fetch('/api/a/', { method: 'POST' })).status, 403);
  assert.equal(writes, 1);
  await fetch('/api/a/', { method: 'POST' });
  assert.equal(bootstraps, 2);
});

test('failed bootstrap does not send the mutation and may be retried', async () => {
  let calls = 0;
  const fetch = createCsrfFetch(async () => { calls++; return json({}, 503); }, settings);
  await assert.rejects(fetch('/api/a/', { method: 'POST' }), /initialize/);
  await assert.rejects(fetch('/api/a/', { method: 'POST' }), /initialize/);
  assert.equal(calls, 2);
});
