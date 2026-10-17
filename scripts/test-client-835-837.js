import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const originalFetch = globalThis.fetch, createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
const anchorClick = window.HTMLAnchorElement.prototype.click;
const requests = [], downloads = [];
const paths = [];
let failNext = false, legacy = false;
URL.createObjectURL = () => 'blob:comparison'; URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
globalThis.fetch = async (input, options) => {
  assert.equal(options.credentials, 'include');
  const url = new URL(input, 'http://localhost');
  paths.push(url.pathname);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname.endsWith('/analysis/')) return json({ success: true, files: [], next_cursor: null });
  if (url.pathname.endsWith('/overview/')) return json({ success: true, client: 'Example client', claims: [], metrics: {}, history: [], period: { from: '2026-10-17', to: '2026-10-17', timezone: 'America/Chicago' } });
  if (url.pathname.endsWith('/actions/')) return json({ success: true, actions: [] });
  if (url.pathname.endsWith('/comparison/')) return json({ success: true, count: 0, rows: [] });
  assert.ok(url.pathname.endsWith('/comparison-835-837/'), url.pathname);
  requests.push(url.searchParams);
  if (url.searchParams.get('format') === 'csv') return new Response('Claim,Billed 837,Billed 835\r\n123456789,100,80', { headers: { 'Content-Type': 'text/csv' } });
  if (failNext) { failNext = false; return json({ success: false, error: 'Synthetic service error' }, 503); }
  const only837 = url.searchParams.get('category') === '837-only';
  const payload = { success: true, count: 12, page: Number(url.searchParams.get('page')), pages: 2, ambiguous_claims: 1, occurrence_count: only837 ? 12 : 24, period: { timezone: "America/Chicago" },
    amount_summary: only837 ? { matched: 0, mismatched: 0, missing_835: 12 } : { matched: 0, mismatched: 12, missing_835: 0 },
    age_summary: { counts: { '0-10': 0, '10-20': 12, '20-30': 0, '30-plus': 0 }, total: 12, unknown: 0 },
    rows: [{ key: 'row1', claim: '123456789', internal_number: 'ABC123', waiting_days: 15,
      billed_837: '100.00', billed_835: only837 ? null : '80.00', difference: only837 ? null : '20.00',
      status: only837 ? '835 not received' : 'Billed amounts differ', source_837: 'claims_20261001.837',
      source_835: only837 ? '' : 'payment_20261016.835', record_835_id: only837 ? null : 42,
      ambiguous: false, occurrences: [
        { key: '837:1', record_id: 1, source_type: '837', file_id: 'source837', filename: 'claims_20261001.837', received_at: '2026-10-01T07:00:00-05:00', internal_number: 'ABC123', claim_sequence: 1, billed_837: '100.00', billed_835: null },
        ...only837 ? [] : [{ key: '835:42', record_id: 42, source_type: '835', file_id: 'source835', filename: 'payment_20261016.835', received_at: '2026-10-16T07:00:00-05:00', internal_number: 'ABC123', claim_sequence: 2, billed_837: null, billed_835: '80.00' }],
      ],
    }] };
  if (legacy) { delete payload.occurrence_count; delete payload.rows[0].occurrences; }
  return json(payload);
};
const button = text => {
  const found = [...document.querySelectorAll('button')].find(item => item.textContent === text);
  assert.ok(found, 'Missing button ' + text); return found;
};
const click = async item => act(async () => (typeof item === 'string' ? button(item) : item).click());
try {
  const { default: Portal } = await server.ssrLoadModule('/src/pages/ClientUserPortal.jsx');
  await act(async () => root.render(React.createElement(Portal, { user: { name: 'Example user' } })));
  assert.deepEqual([...document.querySelectorAll('.cu-controls button')].map(item => item.textContent), ['Refresh', 'Convert a file', '835/837 status', 'Analysis']);
  await click('835/837 status');
  assert.equal(document.querySelector('h1').textContent, '835/837 status');
  assert.deepEqual([...document.querySelectorAll('.cu-controls button')].map(item => item.textContent), ['Refresh', 'Convert a file', 'Home', 'Analysis']);
  assert.equal(document.querySelector('.cu-kpis'), null);
  assert.ok(!document.querySelector('main').textContent.includes('Recent conversions'));
  assert.ok(!document.querySelector('main').textContent.includes('Payer category'));
  assert.deepEqual([...document.querySelectorAll('[aria-label="Claim presence"] button')].map(item => item.textContent), ['In both', 'In 837 only']);
  assert.equal(button('In both').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelectorAll('thead th').length, 10);
  assert.equal(document.querySelector('tbody tr').cells[8].textContent, '$20.00');
  assert.equal(requests.at(-1).get('sort'), 'waiting_days');
  assert.equal(document.querySelectorAll('tbody tr').length, 2);
  assert.ok(!document.querySelector('main').textContent.includes('Billed amounts match'));
  assert.ok(document.querySelector('main').textContent.includes('Confirmed exact matches, including the sign, are excluded'));
  assert.ok(document.querySelector('form[role="search"]'));
  assert.equal(document.querySelectorAll('.cu-aging-row b')[1].textContent, '12 claims');
  assert.ok(document.querySelector('main').textContent.includes('multiple file occurrences'));
  if (process.env.STATUS_PREVIEW_PATH) {
    const fs = await import('node:fs/promises');
    const styles = await Promise.all(['src/index.css', 'src/pages/ClientUserPortal.css', 'src/pages/ClientClaimDetail.css', 'src/components/ClientClaimComparison.css', 'src/components/Client835837Status.css'].map(path => fs.readFile(path, 'utf8')));
    await fs.writeFile(process.env.STATUS_PREVIEW_PATH, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>835/837 status preview</title><style>${styles.join('\n')}</style></head><body>${document.getElementById('root').innerHTML}</body></html>`);
  }
  assert.equal(document.querySelector('tbody th').rowSpan, 2);
  assert.equal(document.querySelector('tbody time').textContent, 'Oct 1, 2026, 7:00 AM');
  await click(document.querySelectorAll('thead th button')[1]);
  assert.equal(requests.at(-1).get('sort'), 'waiting_days');
  await click('Next'); assert.equal(requests.at(-1).get('page'), '2');
  const requestCount = requests.length;
  await act(async () => {
    const input = document.querySelector('input[type="search"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '  ABC123  ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(requests.length, requestCount, 'Typing must not send a request for each key');
  await click('Search');
  assert.equal(requests.at(-1).get('search'), 'ABC123');
  assert.equal(requests.at(-1).get('page'), '1');
  await click('Download CSV');
  assert.equal(requests.at(-1).get('search'), 'ABC123');
  assert.equal(requests.at(-1).has('page'), false);
  downloads.length = 0;
  await click('In 837 only');
  assert.equal(requests.at(-1).get('category'), '837-only');
  assert.equal(requests.at(-1).get('page'), '1');
  assert.equal(requests.at(-1).get('search'), 'ABC123');
  assert.equal(document.querySelector('tbody tr').cells[7].textContent, '—');
  assert.equal(document.querySelector('tbody tr').cells[8].textContent, '—');
  assert.equal(document.querySelector('tbody .cu-link'), null);
  await act(async () => {
    const select = document.querySelector('.cu-age-filter select'); select.value = '10-20';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(requests.at(-1).get('age_band'), '10-20');
  await click('Monthly');
  assert.equal(requests.at(-1).get('period'), 'monthly');
  assert.equal(requests.at(-1).get('category'), '837-only');
  assert.equal(requests.at(-1).get('search'), 'ABC123');
  await click('Download CSV');
  assert.equal(requests.at(-1).get('format'), 'csv');
  assert.equal(requests.at(-1).has('page'), false);
  assert.deepEqual(downloads, ['filex-835-837_837-only_10-20.csv']);
  await click('Clear');
  assert.equal(requests.at(-1).has('search'), false);
  assert.equal(requests.at(-1).get('page'), '1');
  assert.equal(document.querySelector('input[type="search"]').value, '');
  failNext = true; await click('Refresh');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Synthetic service error'));
  await click('Try again');
  assert.equal(document.querySelector('[role="alert"]'), null);
  legacy = true; await click('Refresh');
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.equal(document.querySelector('tbody time').textContent, '—');
  legacy = false;
  await click('Home');
  assert.equal(document.querySelector('h1').textContent, 'Claims overview');
  assert.ok(document.querySelector('.cu-kpis'));
  const beforeAnalysis = paths.length;
  await click(document.querySelector('.cu-controls button:last-child'));
  assert.equal(document.querySelector('h1').textContent, 'Analysis');
  assert.deepEqual([...document.querySelectorAll('.cu-controls button')].map(item => item.textContent), ['Home']);
  assert.equal(document.querySelector('.cu-period-toolbar'), null);
  assert.equal(document.querySelector('.cu-aging-row'), null);
  assert.equal(document.querySelector('.cu-kpis'), null);
  assert.deepEqual(paths.slice(beforeAnalysis), ['/edi835/api/client-portal/analysis/'], 'Analysis must only request its isolated staging records');
  assert.equal(document.querySelector('[role="alert"]'), null);
  await click('Home');
  assert.equal(document.querySelector('h1').textContent, 'Claims overview');
  assert.ok(document.querySelector('.cu-kpis'));
  console.log('835/837 portal navigation, compact sections, filters, chart, unknown amounts, CSV and retry passed.');
} finally {
  await act(async () => root.unmount()); await server.close();
  globalThis.fetch = originalFetch; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl;
  window.HTMLAnchorElement.prototype.click = anchorClick; dom.window.close();
}
