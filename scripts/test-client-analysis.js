import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage', 'FormData', 'File']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const originalFetch = globalThis.fetch, createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
const anchorClick = window.HTMLAnchorElement.prototype.click;
const calls = [], downloads = [];
let fail = false, deferred = null, hold = false;
const claim = (id, billed, sequence) => ({ claim: id, billed, sequence, internal_number: 'REF-TEST' });
const file = (kind, claims) => ({ id: 'file-' + kind, filename: kind === '837' ? 'submitted-claims.837' : 'payer-response.835', kind, uploaded_at: '2026-10-17T12:00:00Z', claims });
const submission = file('837', [claim('SYNTHETIC-1001', '100.00', 1), claim('SYNTHETIC-1002', '100.00', 2),
  claim('SYNTHETIC-1003', '80.00', 3), claim('SYNTHETIC-1003', '90.00', 4), claim('SYNTHETIC-1004', '45.00', 5)]);
const remittance = file('835', [claim('SYNTHETIC-1001', '80.00', 1), claim('SYNTHETIC-1002', '100.00', 2), claim('SYNTHETIC-1003', '80.00', 3), claim('NOT-IN-837', '10.00', 4)]);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
URL.createObjectURL = () => 'blob:analysis'; URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
globalThis.fetch = async (url, options) => {
  assert.equal(url, '/edi835/api/client-portal/analysis/');
  assert.equal(options.credentials, 'include'); calls.push(options);
  if (options.method !== 'POST') return json({ success: true, csrf_token: 'test-csrf' });
  assert.equal(options.headers['X-CSRFToken'], 'test-csrf');
  assert.equal(options.body.getAll('file').length, 1);
  if (hold) { hold = false; return new Promise(resolve => { deferred = resolve; }); }
  if (fail) { fail = false; return json({ success: false, error: 'ST/SE segment counts do not agree.' }, 400); }
  const replacement = options.body.get('file').name === 'replacement.837';
  return json({ success: true, file: replacement ? file('837', [claim('REPLACEMENT', '20.00', 1)]) : options.body.get('kind') === '837' ? submission : remittance });
};
const button = text => {
  const result = [...document.querySelectorAll('button')].find(item => item.textContent === text || item.textContent.startsWith(text));
  assert.ok(result, 'Missing button ' + text); return result;
};
const click = async text => act(async () => button(text).click());
const upload = async (kind, name = `claims.${kind}`, contents = 'synthetic content') => act(async () => {
  const input = document.querySelector(`#analysis-${kind}`);
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([contents], name)] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
try {
  const { default: Analysis } = await server.ssrLoadModule('/src/components/ClientAnalysis.tsx');
  const { analyzeClaims, analysisCsv } = await server.ssrLoadModule('/src/utils/claimAnalysis.ts');
  // Exercise the actual response interceptor: display masking must not change
  // identifiers before comparison/grouping (different claims can share a suffix).
  const { readFile } = await import('node:fs/promises');
  const mainSource = await readFile('src/main.jsx', 'utf8');
  const interceptorSource = mainSource.slice(mainSource.indexOf('function applyDemoEncodingToJsonResponse'), mainSource.indexOf('\ncreateRoot('));
  const { encodeDemoData } = await server.ssrLoadModule('/src/utils/demoEncoder.js');
  const encodeResponse = new Function('localStorage', 'window', 'encodeDemoData', 'demoStorageKey', `return ${interceptorSource}`)(localStorage, window, encodeDemoData, 'mir-demo-substitution');
  localStorage.setItem('mir-demo-substitution', 'true');
  for (const endpoint of ['analysis', 'comparison-835-837']) {
    const response = json({ rows: [{ claim: 'FIRST-1234' }, { claim: 'SECOND-1234' }] });
    Object.defineProperty(response, 'url', { value: `http://localhost/edi835/api/client-portal/${endpoint}/` });
    const result = await encodeResponse(response).json();
    assert.deepEqual(result.rows.map(row => row.claim), ['FIRST-1234', 'SECOND-1234']);
  }
  localStorage.clear();
  const compared = analyzeClaims(submission, remittance);
  assert.equal(compared.length, 3);
  assert.equal(compared[0].difference, '20.00');
  assert.equal(compared[1].occurrences.length, 3);
  assert.equal(compared[1].difference, null);
  assert.equal(compared[1].ambiguous, true);
  assert.equal(compared[2].category, '837-only');
  assert.ok(!compared.some(row => row.claim === 'NOT-IN-837' || row.claim === 'SYNTHETIC-1002'));
  assert.equal(analyzeClaims(file('837', [claim('SIGNED', '100.00', 1)]), file('835', [claim('SIGNED', '-100.00', 1)]))[0].difference, '200.00');
  assert.equal(analyzeClaims(file('837', [claim('CENT', '99999999999999.99', 1)]), file('835', [claim('CENT', '99999999999999.98', 1)]))[0].difference, '0.01');
  for (const amount of ['0.00', '-100.00', '100.00']) assert.equal(analyzeClaims(file('837', [claim('MATCH', amount, 1)]), file('835', [claim('MATCH', amount, 1)])).length, 0);
  const csv = analysisCsv(analyzeClaims(file('837', [claim('=FORMULA', '10.00', 1)]), null));
  assert.ok(csv.includes("'=FORMULA"));
  assert.equal(analysisCsv(compared).split('\r\n').length, 7);

  await act(async () => root.render(React.createElement(Analysis)));
  assert.equal(calls.length, 0, 'Analysis must not query stored claim data');
  assert.equal(button('Upload 835').disabled, true);
  assert.equal(document.querySelectorAll('.cu-aging-row').length, 0);
  await upload('837');
  assert.equal(document.querySelectorAll('tbody tr').length, 5);
  assert.equal(button('Upload 835').disabled, false);
  assert.ok(document.body.textContent.includes('Awaiting 835 upload'));
  await upload('835');
  assert.equal(document.querySelectorAll('tbody tr').length, 5, 'one pair and one group of three occurrences');
  assert.deepEqual([...document.querySelectorAll('tbody th')].map(cell => cell.rowSpan), [2, 3]);
  assert.ok(document.body.textContent.includes('$20.00'));
  assert.ok(document.body.textContent.includes('Multiple occurrences'));
  assert.equal(document.querySelectorAll('thead th').length, 9);
  assert.equal(document.querySelector('tbody .cu-link'), null, 'Analysis must not link ephemeral IDs to saved claims');
  await click('Download CSV'); assert.deepEqual(downloads, ['filex-analysis_both.csv']);
  if (process.env.ANALYSIS_PREVIEW_PATH) {
    const fs = await import('node:fs/promises');
    const styles = await Promise.all(['src/index.css', 'src/pages/ClientUserPortal.css', 'src/components/ClientClaimComparison.css', 'src/components/Client835837Status.css', 'src/components/ClientAnalysis.css'].map(path => fs.readFile(path, 'utf8')));
    await fs.writeFile(process.env.ANALYSIS_PREVIEW_PATH, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Analysis preview</title><style>${styles.join('\n')}</style></head><body><div class="cu-shell"><main class="cu-main cu-compact"><header class="cu-heading"><div class="cu-heading-copy"><span class="eyebrow">Example client</span><h1>Analysis</h1></div><div class="cu-controls"><button class="cu-btn">Home</button></div></header>${document.getElementById('root').innerHTML}</main></div></body></html>`);
  }
  await act(async () => {
    const input = document.querySelector('input[type="search"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'SYNTHETIC-1003');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Search');
  assert.equal(document.querySelectorAll('tbody tr').length, 3);
  await click('Clear');
  await click('In 837 only');
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.ok(document.body.textContent.includes('Not in uploaded 835'));
  fail = true; await upload('835');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('segment counts'));
  assert.equal(document.querySelectorAll('tbody tr').length, 5, 'Failed 835 must not retain stale comparisons');
  hold = true; await upload('835');
  const pending = calls.at(-1);
  await upload('837', 'replacement.837');
  assert.equal(pending.signal.aborted, true);
  await act(async () => deferred(json({ success: true, file: remittance })));
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.ok(document.body.textContent.includes('Awaiting 835 upload'));
  assert.ok(!document.body.textContent.includes('payer-response.835'));
  const before = calls.length;
  await upload('837', 'empty.837', '');
  assert.equal(calls.length, before);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('non-empty'));
  assert.equal(document.querySelector('tbody th'), null);
  assert.equal(localStorage.length, 0, 'Uploaded data must not enter browser storage');
  console.log('Analysis uploads, signed comparisons, duplicate grouping, CSV, filters, validation errors, reset and stale-response cancellation passed.');
} finally {
  await act(async () => root.unmount()); await server.close();
  globalThis.fetch = originalFetch; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl;
  window.HTMLAnchorElement.prototype.click = anchorClick; dom.window.close();
}
