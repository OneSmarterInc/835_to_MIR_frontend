import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const originalFetch = globalThis.fetch;
const requests = [];
let release, hold = false, retried = false;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const row = (id, name, state = 'QUEUED') => ({ receipt_id: id, filename: name, workflow: '837',
  channel: 'STAFF', state, received_at: '2026-10-22T12:00:00Z' });
globalThis.fetch = async (path, options) => {
  requests.push({ path, options });
  assert.equal(options.credentials, 'include');
  if (path.endsWith('/retry')) {
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).reason, 'Dependency restored');
    retried = true;
    return json({ receipt_id: 'failed', state: 'QUEUED' }, 202);
  }
  if (path === '/api/v1/transfers/failed') return json({ receipt_id: 'failed', filename: 'failed.837',
    workflow: '837', lifecycle_state: retried ? 'QUEUED' : 'FAILED', validation_outcome: 'PENDING',
    safe_error_code: '', converter_version: '', source_url: '/api/v1/transfers/failed/source',
    retry_eligible: !retried, outputs: [], attempts: [], retries: [] });
  if (path.startsWith('/api/v1/transfers?')) {
    if (hold) return new Promise(resolve => { release = resolve; });
    const params = new URL(path, 'http://localhost').searchParams;
    const result = params.get('status') === 'FAILED' ? row('failed', 'failed.837', 'FAILED') : row('old', 'old.837');
    return json({ transfers: [result], pages: 1, total: 1 });
  }
  throw new Error(`Unexpected endpoint: ${path}`);
};
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
try {
  const { IntakeHistory } = await server.ssrLoadModule('/src/components/IntakeReceipts.tsx');
  await act(async () => root.render(React.createElement(IntakeHistory, { clientId: 'client-a' })));
  assert.equal(requests.length, 0, 'Collapsed history must not fetch');
  await act(async () => { document.querySelector('details').open = true; });
  await flush();
  assert.match(document.body.textContent, /old\.837/);
  hold = true;
  await act(async () => {
    const select = document.querySelector('select'); select.value = 'FAILED';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.doesNotMatch(document.body.textContent, /old\.837/, 'Old rows must disappear in the first filter render');
  assert.match(document.body.textContent, /Loading receipts/);
  hold = false;
  await act(async () => release(json({ transfers: [row('failed', 'failed.837', 'FAILED')], pages: 1, total: 1 })));
  const open = [...document.querySelectorAll('button')].find(button => button.textContent === 'failed.837');
  await act(async () => open.click());
  await flush();
  assert.match(document.body.textContent, /Download source/);
  assert.ok(document.querySelector('a').href.endsWith('/api/v1/transfers/failed/source'));
  const input = document.querySelector('input[placeholder]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Dependency restored');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // React change handling in jsdom uses the native input event.
  await act(async () => input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await flush();
  assert.equal(retried, true);
  assert.equal(requests.filter(request => request.path.endsWith('/retry')).length, 1, 'No automatic POST replay');
  assert.ok(![...document.querySelectorAll('button')].some(button => button.textContent === 'Retry transfer'));
  await act(async () => root.render(React.createElement(IntakeHistory, { clientId: 'client-b' })));
  assert.doesNotMatch(document.body.textContent, /failed\.837/, 'Changing clients must clear prior data immediately');
  console.log('PASS: lazy filtered history, no stale rows, private detail links, audited single retry, tenant reset');
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  await server.close();
  dom.window.close();
}
