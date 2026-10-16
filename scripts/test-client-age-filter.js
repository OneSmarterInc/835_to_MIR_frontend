import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const root = createRoot(document.getElementById('root'));
const originalFetch = globalThis.fetch;
const originalCreateUrl = URL.createObjectURL;
const originalRevokeUrl = URL.revokeObjectURL;
const requests = [];
const savedFiles = [];
URL.createObjectURL = () => 'blob:test-csv';
URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { savedFiles.push(this.download); };
const ages = [0, 9, 10, 19, 20, 29, 30, 90, null];
const allAges = [...ages, ...Array(205).fill(15)];
const bandFor = age => age == null ? 'unknown' : age < 10 ? '0-10' : age < 20 ? '10-20' : age < 30 ? '20-30' : '30-plus';
let failNext = false;
globalThis.fetch = async input => {
  const params = new URL(input, 'http://localhost').searchParams;
  requests.push(params);
  if (params.get('format') === 'csv') return new Response('Days waiting\r\n30', {
    headers: { 'Content-Type': 'text/csv' },
  });
  if (failNext) {
    failNext = false;
    return new Response(JSON.stringify({ success: false, error: 'Unavailable' }), { status: 503 });
  }
  const ageFilter = params.get('age_band');
  const filtered = allAges.filter(age => ageFilter === 'all' || bandFor(age) === ageFilter);
  const counts = Object.fromEntries(['0-10', '10-20', '20-30', '30-plus'].map(band => [band, filtered.filter(age => bandFor(age) === band).length]));
  return new Response(JSON.stringify({ success: true, count: filtered.length, pages: 2,
    age_summary: { counts, total: filtered.length, unknown: filtered.filter(age => age == null).length },
    page: Number(params.get('page')), rows: ages.filter(age => ageFilter === 'all' || bandFor(age) === ageFilter).map((waiting_days, i) => ({
      key: String(i), claim: 'TEST' + i, waiting_days, paid_835: '0.00', is_held: i % 2 === 0,
    })) }), { headers: { 'Content-Type': 'application/json' } });
};
const click = async el => act(async () => el.click());
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent === text);
try {
  const { default: Table, claimAgeBand } = await server.ssrLoadModule('/src/components/ClientClaimComparison.jsx');
  assert.deepEqual(ages.map(claimAgeBand), ['0-10', '0-10', '10-20', '10-20', '20-30', '20-30', '30-plus', '30-plus', 'unknown']);
  await act(async () => root.render(React.createElement(Table, { periodQuery: 'period=all', payerFilter: 'Denied' })));
  assert.deepEqual([...document.querySelectorAll('tbody tr')].map(el => el.className),
    ages.map(age => 'cu-row-age-' + claimAgeBand(age)));
  const chartCounts = () => [...document.querySelectorAll('.cu-aging-row b')].map(el => el.textContent);
  assert.deepEqual(chartCounts(), ['2 claims', '207 claims', '2 claims', '2 claims']);
  assert.ok(document.querySelector('.cu-aging-summary').textContent.includes('1 claims have unknown age'));
  await click(button('Next'));
  assert.equal(requests.at(-1).get('page'), '2');
  assert.deepEqual(chartCounts(), ['2 claims', '207 claims', '2 claims', '2 claims'], 'Chart covers all pages');
  const select = document.querySelector('.cu-age-filter select');
  assert.equal(select.options.length, 5);
  await act(async () => { select.value = '30-plus'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(requests.at(-1).get('age_band'), '30-plus');
  assert.equal(requests.at(-1).get('page'), '1');
  assert.equal(requests.at(-1).get('payer_status'), 'denied');
  assert.deepEqual(chartCounts(), ['0 claims', '0 claims', '0 claims', '2 claims'], 'Chart follows the table age filter');
  await click(document.querySelector('th button'));
  assert.equal(requests.at(-1).get('age_band'), '30-plus');
  await click(button('Download CSV'));
  assert.equal(requests.at(-1).get('age_band'), '30-plus');
  assert.equal(requests.at(-1).get('format'), 'csv');
  assert.equal(requests.at(-1).has('page'), false);
  assert.equal(savedFiles.length, 1);
  failNext = true;
  await click(document.querySelector('th button'));
  assert.deepEqual(chartCounts(), ['—', '—', '—', '—'], 'Failed requests must not display misleading zero counts');
  console.log('Age filter and chart: boundaries, all-page totals, filter consistency, errors and CSV scope passed.');
} finally {
  await act(async () => root.unmount());
  await server.close();
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateUrl;
  URL.revokeObjectURL = originalRevokeUrl;
  dom.window.close();
}
