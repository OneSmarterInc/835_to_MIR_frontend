import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import fs from 'node:fs';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/administrator?nav=intake-control' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'location', 'history']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const originalFetch = globalThis.fetch;
const posts = [];
let holdPartners = false, release;
const partner = { id: 'partner-1', name: 'Synthetic integration', primary_client_id: 'client-a', client_ids: ['client-a', 'client-b'], active: true,
  workflows: ['835', '837'], auth_mode: 'MTLS', routing_required: true, requests_per_minute: 60, concurrent_jobs: 2, storage_limit_bytes: 10737418240,
  stored_bytes: 51200, permissions: [], credentials: [], routes: [] };
const json = data => new Response(JSON.stringify(data));
globalThis.fetch = async (url, config) => {
  assert.equal(config.credentials, 'include');
  if (config.method === 'POST') { posts.push(JSON.parse(config.body)); return json({ success: true, token: posts.at(-1).operation === 'TOKEN' ? 'one-time-synthetic-token' : undefined }); }
  const tab = new URL(url, location.origin).searchParams.get('tab');
  if (tab === 'bootstrap') return json({ clients: [{ id: 'client-a', name: 'Synthetic client A', client_code: 'A' }, { id: 'client-b', name: 'Synthetic client B', client_code: 'B' }], staff: [{ id: 'user-1', email: 'operator@example.test' }], can_approve: true });
  if (tab === 'operations') return json({ counts: { QUEUED: 7, PROCESSING: 2, COMPLETED: 50, FAILED: 3, DUPLICATE: 4 }, oldest_queue_seconds: 45,
    expired_leases: 0, delivery_unconfirmed: 1, quarantine_open: 2, expiring_credentials: 1, active_holds: 1,
    as_of: '2026-10-22T12:00:00Z', disk: { total_bytes: 2 ** 36, free_bytes: 2 ** 35 },
    rows: [{ id: 'synthetic-receipt', client_id: 'client-a', state: 'FAILED', safe_error_code: 'RECOVERY_REVIEW_REQUIRED', received_at: '2026-10-22T11:00:00Z' }], page: 1, pages: 1, total: 1 });
  if (tab === 'partners') return holdPartners ? new Promise(resolve => { release = resolve; }) : json({ rows: [partner], page: 1, pages: 1, total: 1 });
  if (tab === 'access') return json({ rows: [], targets: null, page: 1, pages: 1, total: 0 });
  if (tab === 'quarantine') return json({ rows: [], page: 1, pages: 1, total: 0 });
  if (tab === 'retention') return json({ rows: [], policy: null, scope: 'Private intake copies only.', eligible_sample_count: 0, page: 1, pages: 1, total: 0 });
  throw new Error(`Unexpected request ${url}`);
};
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const click = async label => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === label); assert.ok(button, label); await act(async () => button.click()); await flush(); };
const change = async (input, value) => act(async () => {
  const prototype = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const field = label => [...document.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent === label)?.querySelector('input,select,textarea');
const submit = async () => { await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await flush(); };
try {
  const { default: Control } = await server.ssrLoadModule('/src/onesmarter_admin/components/IntakeControl.tsx');
  await act(async () => root.render(React.createElement(Control)));
  await flush();
  assert.match(document.body.textContent, /synthetic-receipt/);
  assert.doesNotMatch(document.body.textContent, /1,248|3,741/);
  // Retain a synthetic visual fixture for review; no live data is used.
  fs.writeFileSync('../../outputs/intake-control-preview.html', '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#e8eef4;font:14px system-ui}</style><style>'+fs.readFileSync('src/onesmarter_admin/components/IntakeControl.css','utf8')+'</style>'+document.getElementById('root').innerHTML);
  holdPartners = true;
  await click('Partners');
  assert.doesNotMatch(document.body.textContent, /synthetic-receipt/, 'No prior tab rows on the first render');
  assert.match(document.body.textContent, /Loading current data/);
  holdPartners = false;
  await act(async () => release(json({ rows: [partner], page: 1, pages: 1, total: 1 })));
  await click('Manage');
  await click('Quotas');
  await change(field('Requests per minute'), '35');
  await change(field('Reason'), 'Approved throughput allocation');
  await submit();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].data.requests_per_minute, 35);
  assert.equal(posts[0].partner_id, 'partner-1');
  await click('Issue token');
  await change(field('Validity in days'), '10');
  await change(field('Reason'), 'Approved token rotation');
  await submit();
  assert.match(document.body.textContent, /one-time-synthetic-token/);
  await click('Dismiss token');
  assert.doesNotMatch(document.body.textContent, /one-time-synthetic-token/);
  await click('Access & targets');
  assert.match(document.body.textContent, /Queue target: —s/);
  await click('Grant access');
  assert.equal(field('Allow source / output downloads').checked, false);
  assert.equal(field('Allow eligible retries').checked, false);
  assert.ok(location.search.includes('intakeTab=access'));
  assert.equal(posts.length, 2, 'No automatic mutation replay');
  console.log('PASS: real API metrics, no stale-tab rows, typed quota submission, one-time token dismissal, default-deny permissions and stable tab URL.');
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  await server.close(); dom.window.close();
}
