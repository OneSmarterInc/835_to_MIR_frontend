import test from 'node:test';
import assert from 'node:assert/strict';
import { createCsrfFetch } from '../src/utils/csrfFetch.js';

const origin = 'https://filex.example';
const backend = 'https://api.example';
const calls = [];
globalThis.window = {
  location: { origin, search: '' },
  fetch: async (input, options = {}) => {
    const request = new Request(new URL(String(input), origin), options);
    calls.push(request);
    if (request.url.endsWith('/accounts/api/user/')) {
      return Response.json({ csrf_token: 'server-issued-token' });
    }
    if (request.method === 'POST') {
      // This is the media type Django's JSONParser must receive.
      assert.equal(request.headers.get('content-type'), 'application/json');
      assert.equal(request.headers.get('accept'), 'application/json');
      assert.equal(request.headers.get('x-csrftoken'), 'server-issued-token');
      assert.equal(request.headers.get('x-admin-screen'), 'conversions');
      assert.deepEqual(await request.json(), { file_id: 'source-id' });
      return Response.json({ job_id: 'job-id' }, { status: 202 });
    }
    return Response.json({ state: 'COMPLETED', result: { success: true } });
  },
};
globalThis.document = { visibilityState: 'visible' };
// Match main.jsx: governor first, CSRF interceptor around the governor.
await import('../src/utils/requestGovernor.js');
const fetch = createCsrfFetch(window.fetch, { frontendOrigin: origin, backendUrl: backend });

for (const [name, headers] of [
  ['mixed-case object', { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Admin-Screen': 'conversions' }],
  ['lowercase object', { 'content-type': 'application/json', accept: 'application/json', 'x-admin-screen': 'conversions' }],
  ['Headers instance', new Headers({ 'Content-Type': 'application/json', 'X-Admin-Screen': 'conversions' })],
  ['header tuples', [['Content-Type', 'application/json'], ['X-Admin-Screen', 'conversions']]],
]) {
  test(`CSRF and async conversion preserve single JSON headers: ${name}`, async () => {
    const response = await fetch(`${backend}/api/convert/`, {
      method: 'POST', headers, body: JSON.stringify({ file_id: 'source-id' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    const start = calls.findLast(request => request.method === 'POST');
    assert.equal(start.url, `${backend}/api/convert-async/`);
    assert.equal(start.credentials, 'include');
    assert.equal(calls.at(-1).method, 'GET');
  });
}
