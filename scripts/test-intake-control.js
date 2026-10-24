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
const previews = [];
const extractedRoute = { workflow: '837', isa_sender_qualifier: 'ZZ', isa_sender: 'SAMPLE', isa_receiver_qualifier: 'ZZ',
  isa_receiver: 'RECEIVER', isa_version: '00501', gs_sender: 'SAMPLE', gs_receiver: 'RECEIVER', gs_version: '005010X222A1', st_version: '005010X222A1' };
let previewRoutes = [extractedRoute];
let holdPartners = false, release;
const partner = { id: 'partner-1', name: 'Synthetic integration', primary_client_id: 'client-a', client_ids: ['client-a', 'client-b'], active: true,
  workflows: ['835', '837'], auth_mode: 'TOKEN', routing_required: true, route_enforcement_enabled: false, requests_per_minute: 60, concurrent_jobs: 2, storage_limit_bytes: 10737418240,
  stored_bytes: 51200, permissions: [{ workflow: '835', action: 'READ', channel: 'PARTNER' }], credentials: [], routes: [] };
const json = data => new Response(JSON.stringify(data));
globalThis.fetch = async (url, config) => {
  assert.equal(config.credentials, 'include');
  if (config.method === 'POST') {
    if (config.body instanceof FormData) {
      assert.equal(config.headers, undefined, 'Browser supplies multipart boundary');
      assert.equal(config.body.get('action'), 'route_preview');
      assert.equal(config.body.get('partner_id'), 'partner-1');
      previews.push(config.body);
      return json({ routes: previewRoutes, transaction_set_count: previewRoutes.length });
    }
    const body = JSON.parse(config.body); posts.push(body);
    if (body.operation === 'QUOTAS' || body.operation === 'PERMISSIONS') Object.assign(partner, body.data);
    return json({ success: true, token: body.operation === 'TOKEN' ? 'one-time-synthetic-token' : undefined });
  }
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
  const panel = document.querySelector('[aria-label="Selected partner"]');
  assert.ok(panel.compareDocumentPosition(document.querySelector('.ic-table-wrap')) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'Selected partner appears before directory');
  assert.match(panel.textContent, /10.73741824 GB/);
  assert.match(panel.textContent, /Details only — under development/);
  const checkbox = label => [...document.querySelectorAll('label')].find(l => l.textContent.trim() === label)?.querySelector('input[type="checkbox"]');
  await click('Authentication');
  assert.equal(field('Require approved envelope routing'), undefined, 'Disabled backend matching cannot be enabled from this form');
  assert.match(document.body.textContent, /Authentication and client permissions still apply/);
  await click('Cancel');
  await click('Permissions');
  assert.equal(document.querySelector('select[multiple]'), null);
  assert.equal(checkbox('835 · READ').checked, true);
  assert.equal(checkbox('837 · SUBMIT').checked, false);
  await act(async () => checkbox('837 · SUBMIT').click());
  await change(field('Reason'), 'Approve submit alongside existing read');
  await submit();
  assert.deepEqual(posts.at(-1).data.permissions, [
    { workflow: '835', action: 'READ', channel: 'PARTNER' }, { workflow: '837', action: 'SUBMIT', channel: 'PARTNER' },
  ]);
  await click('Permissions');
  assert.equal(checkbox('837 · SUBMIT').checked, true, 'Saved permissions are selected on reopening');
  await click('Cancel');
  await click('Client scopes');
  assert.equal(checkbox('Synthetic client A (A)').checked, true);
  assert.equal(checkbox('Synthetic client B (B)').checked, true);
  await click('Cancel');
  await click('Quotas');
  assert.ok(document.querySelector('[aria-label="Selected partner"]').compareDocumentPosition(document.querySelector('form')) & window.Node.DOCUMENT_POSITION_FOLLOWING, 'Actions remain above the editor');
  const storageAmount = () => document.querySelector('input[aria-label="Partner storage limit"]');
  const storageUnit = () => document.querySelector('select[aria-label="Partner storage limit unit"]');
  assert.equal(storageAmount().value, '10.73741824');
  assert.equal(storageUnit().value, 'GB');
  await change(field('Requests per minute'), '35');
  await change(field('Reason'), 'Approved throughput allocation');
  await submit();
  assert.equal(posts.length, 2);
  assert.equal(posts.at(-1).data.requests_per_minute, 35);
  assert.equal(posts.at(-1).data.storage_limit_bytes, 10737418240, 'Unchanged amount retains the exact stored byte limit');
  assert.equal(posts.at(-1).partner_id, 'partner-1');
  for (const [amount, unit, expected] of [['1.5', 'TB', 1500000000000], ['250', 'MB', 250000000]]) {
    await click('Quotas');
    await change(storageAmount(), amount);
    await change(storageUnit(), unit);
    await change(field('Reason'), 'Approved storage allocation');
    await submit();
    assert.equal(posts.at(-1).data.storage_limit_bytes, expected);
    assert.match(document.querySelector('[aria-label="Saved partner settings"]').textContent, new RegExp(`${amount.replace('.', '\\.')} ${unit}`));
  }
  await click('Quotas');
  await change(storageAmount(), '1001');
  await change(storageUnit(), 'TB');
  await submit();
  assert.equal(posts.length, 4, 'Out-of-range storage never reaches the API');
  assert.match(document.querySelector('[role="alert"]').textContent, /1,000 TB/);
  await click('Close partner');
  assert.equal(document.querySelector('form'), null, 'Closing partner also closes its editor');
  await click('Manage');
  await click('Issue token');
  await change(field('Validity in days'), '10');
  await change(field('Reason'), 'Approved token rotation');
  await submit();
  assert.match(document.body.textContent, /one-time-synthetic-token/);
  const copied = [];
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true,
    value: { writeText: async value => { copied.push(value); } } });
  await click('Copy token');
  assert.deepEqual(copied, ['one-time-synthetic-token']);
  assert.match(document.querySelector('[aria-label="New token"] [role="status"]').textContent, /Token copied/);
  window.navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
  await click('Copied!');
  assert.match(document.querySelector('[aria-label="New token"] [role="status"]').textContent, /copy it manually/);
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined });
  await click('Copy token');
  assert.match(document.body.textContent, /one-time-synthetic-token/, 'Unavailable clipboard preserves token for manual copy');
  await click('Dismiss token');
  assert.doesNotMatch(document.body.textContent, /one-time-synthetic-token/);
  await click('Access & targets');
  assert.match(document.body.textContent, /Queue target: —s/);
  await click('Grant access');
  assert.equal(field('Allow source / output downloads').checked, false);
  assert.equal(field('Allow eligible retries').checked, false);
  assert.ok(location.search.includes('intakeTab=access'));
  assert.equal(posts.length, 5, 'No automatic mutation replay');
  await click('Partners');
  await click('Manage');
  await click('Add route');
  const uploadSample = async (workflow = '837') => {
    const input = document.querySelector(`input[aria-label="${workflow} file"]`);
    assert.equal(input.accept, '', 'Extensionless EDI is selectable');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['synthetic envelope'], 'extensionless')] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
  };
  await uploadSample();
  assert.match(document.body.textContent, /Saved routes do not enforce header matching/);
  assert.equal(previews.length, 1);
  assert.ok(previews[0].get('file_837'));
  assert.equal(posts.length, 5, 'Preview does not save a route');
  assert.equal(field('Workflow').value, '837');
  assert.equal(field('ISA sender ID').value, 'SAMPLE');
  assert.equal(field('Client').value, '', 'Client is never inferred from envelope identifiers');
  await change(field('Client'), 'client-a');
  await change(field('Reason'), 'Reviewed sample envelope for approved client');
  await submit();
  assert.equal(posts.at(-1).operation, 'ROUTE');
  assert.equal(posts.at(-1).data.client_id, 'client-a');
  assert.equal(posts.at(-1).data.gs_version, '005010X222A1');
  await click('Add route');
  previewRoutes = [extractedRoute];
  await uploadSample();
  previewRoutes = [{ ...extractedRoute, workflow: '835', gs_version: '005010X221A1', st_version: '' }, extractedRoute];
  await uploadSample('835');
  assert.ok(previews.at(-1).get('file_835'));
  assert.ok(previews.at(-1).get('file_837'), 'Selecting 835 retains the selected 837');
  assert.equal(document.querySelectorAll('[aria-label="Envelope route details"] tbody tr').length, 2);
  assert.equal(field('ISA sender ID'), undefined, 'Bulk routes are reviewed together rather than overwritten');
  assert.equal(posts.length, 6, 'Inspection does not save routes');
  assert.ok([...document.querySelectorAll('button')].some(b => b.textContent === 'Save 2 routes'));
  await change(field('Client'), 'client-a');
  await change(field('Reason'), 'Reviewed both full files for the selected client');
  await submit();
  assert.equal(posts.at(-1).operation, 'ROUTES');
  assert.deepEqual(posts.at(-1).data.routes, previewRoutes);
  assert.equal(posts.at(-1).data.client_id, 'client-a');
  await click('Add route');
  previewRoutes = [extractedRoute];
  await uploadSample();
  await click('Remove 837');
  assert.equal(field('ISA sender ID').value, '', 'Removing a file clears extracted fields');
  await click('Cancel');
  console.log('PASS: saved settings, selected partner above editor, checkbox permissions/scopes, byte-preserving storage units and limits, no stale rows, token dismissal and default-deny grants.');
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  await server.close(); dom.window.close();
}
