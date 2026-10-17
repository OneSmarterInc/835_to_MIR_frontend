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
let fail = false, deferred = null, hold = false, failLoad = false;
const savedFiles = new Map();
const claim = (id, billed, sequence, payment = null, patient_responsibility = null) => ({ claim: id, billed, sequence, payment, patient_responsibility, internal_number: 'REF-TEST' });
const file = (kind, claims) => ({ id: 'file-' + kind, filename: kind === '837' ? 'submitted-claims.837' : 'payer-response.835', kind, uploaded_at: '2026-10-17T12:00:00Z', claims });
const submission = file('837', [claim('SYNTHETIC-1001', '100.00', 1), claim('SYNTHETIC-1002', '657.00', 2),
  claim('SYNTHETIC-1003', '80.00', 3), claim('SYNTHETIC-1003', '90.00', 4), claim('SYNTHETIC-1004', '45.00', 5)]);
const remittance = file('835', [claim('SYNTHETIC-1001', '80.00', 1, '50.00', '20.00'), claim('SYNTHETIC-1002', '657.00', 2, '0.00', '657.00'), claim('SYNTHETIC-1003', '80.00', 3, '60.00', '20.00'), claim('NOT-IN-837', '10.00', 4, '10.00', '0.00')]);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
URL.createObjectURL = () => 'blob:analysis'; URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
globalThis.fetch = async (url, options) => {
  assert.ok(url.startsWith('/edi835/api/client-portal/analysis/'));
  assert.equal(options.credentials, 'include'); calls.push(options);
  if (options.method !== 'POST') {
    if (url.includes('csrf_only')) return json({ success: true, csrf_token: 'test-csrf' });
    if (failLoad) { failLoad = false; return json({ success: false, error: 'Loading failed' }, 503); }
    const files = [...savedFiles.values()];
    const offset = Number(new URL(url, 'http://localhost').searchParams.get('after') || 0);
    return json({ success: true, csrf_token: 'test-csrf', files: files.slice(offset, offset + 1), next_cursor: offset + 1 < files.length ? String(offset + 1) : null });
  }
  assert.equal(options.headers['X-CSRFToken'], 'test-csrf');
  assert.equal(options.body.getAll('file').length, 1);
  if (hold) { hold = false; return new Promise(resolve => { deferred = resolve; }); }
  if (fail) { fail = false; return json({ success: false, error: 'ST/SE segment counts do not agree.' }, 400); }
  const replacement = options.body.get('file').name === 'replacement.837';
  const saved = replacement ? { ...file('837', [claim('REPLACEMENT', '20.00', 1)]), id: 'another-837', filename: 'replacement.837' } : options.body.get('kind') === '837' ? submission : remittance;
  const reused = savedFiles.has(saved.id);
  savedFiles.set(saved.id, saved);
  return json({ success: true, saved: true, reused, file: saved });
};
const button = text => {
  const result = [...document.querySelectorAll('button')].find(item => item.textContent === text || item.textContent.startsWith(text));
  assert.ok(result, 'Missing button ' + text); return result;
};
const click = async text => act(async () => button(text).click());
const upload = async (kind, name = `claims.${kind}`, contents = 'synthetic content') => act(async () => {
  const input = document.querySelector(`#analysis-${kind}`);
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([contents], name)] });
  Object.defineProperty(input, 'value', { configurable: true, writable: true, value: name });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
async function capturePreview(path) {
  if (path) {
    const fs = await import('node:fs/promises');
    const styles = await Promise.all(['src/index.css', 'src/pages/ClientUserPortal.css', 'src/components/ClientClaimComparison.css', 'src/components/Client835837Status.css', 'src/components/ClientAnalysis.css'].map(path => fs.readFile(path, 'utf8')));
    await fs.writeFile(path, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Analysis preview</title><style>${styles.join('\n')}</style></head><body><div class="cu-shell"><main class="cu-main cu-compact"><header class="cu-heading"><div class="cu-heading-copy"><span class="eyebrow">Example client</span><h1>Analysis</h1></div><div class="cu-controls"><button class="cu-btn">Home</button></div></header>${document.getElementById('root').innerHTML}</main></div></body></html>`);
  }
}
try {
  const { default: Analysis } = await server.ssrLoadModule('/src/components/ClientAnalysis.tsx');
  const { analyzeClaims, analysisCsv, analysisSources } = await server.ssrLoadModule('/src/utils/claimAnalysis.ts');
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
  assert.equal(compared.length, 4);
  assert.equal(compared[0].difference, '20.00');
  assert.equal(compared[2].occurrences.length, 3);
  assert.equal(compared[2].difference, null);
  assert.equal(compared[2].ambiguous, true);
  assert.equal(compared[3].category, '837-only');
  assert.ok(!compared.some(row => row.claim === 'NOT-IN-837'));
  assert.equal(analyzeClaims(file('837', [claim('SIGNED', '100.00', 1)]), file('835', [claim('SIGNED', '-100.00', 1)]))[0].difference, '200.00');
  assert.equal(analyzeClaims(file('837', [claim('CENT', '99999999999999.99', 1)]), file('835', [claim('CENT', '99999999999999.98', 1)]))[0].difference, '0.01');
  for (const amount of ['0.00', '-100.00', '100.00']) {
    const row = analyzeClaims(file('837', [claim('MATCH', amount, 1)]), file('835', [claim('MATCH', amount, 1, amount, '0.00')]))[0];
    assert.equal(row.billed_status, 'Match'); assert.equal(row.allowed_status, 'Match');
  }
  for (const [billed, payment, responsibility, billedStatus, allowedStatus] of [
    ['657.00', '0.00', '657.00', 'Match', 'Match'],
    ['657.00', '500.00', '157.00', 'Match', 'Match'],
    ['657.00', '500.00', '100.00', 'Match', 'Mismatch'],
    ['700.00', '500.00', '157.00', 'Mismatch', 'Match'],
    ['700.00', '500.00', '100.00', 'Mismatch', 'Mismatch'],
    ['657.00', '0.00', null, 'Match', 'Amount unavailable'],
    ['657.00', '-657.00', '0.00', 'Match', 'Mismatch'],
  ]) {
    const row = analyzeClaims(file('837', [claim('EXAMPLE', '657.00', 1)]), file('835', [claim('EXAMPLE', billed, 1, payment, responsibility)]))[0];
    assert.equal(row.billed_status, billedStatus); assert.equal(row.allowed_status, allowedStatus);
    if (responsibility === null) { assert.equal(row.allowed, null); assert.equal(row.allowed_difference, null); }
  }
  assert.equal(compared[1].allowed, '657.00');
  assert.equal(compared[1].allowed_difference, '0.00');
  assert.equal(compared[0].allowed_difference, '30.00');
  const centsRow = analyzeClaims(file('837', [claim('CENTS', '0.30', 1)]), file('835', [claim('CENTS', '0.30', 1, '0.10', '0.20')]))[0];
  assert.equal(centsRow.allowed_status, 'Match');
  const legacy = analyzeClaims(file('837', [claim('LEGACY', '100.00', 1)]), file('835', [{ claim: 'LEGACY', billed: '100.00', sequence: 1, internal_number: '' }]))[0];
  assert.equal(legacy.allowed_status, 'Amount unavailable');
  const repeated = analyzeClaims(file('837', [claim('DUP', '657.00', 1), claim('DUP', '657.00', 2)]),
    file('835', [claim('DUP', '657.00', 1, '0.00', '657.00'), claim('DUP', '657.00', 2, '0.00', '657.00')]));
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].occurrences.length, 2);
  assert.equal(repeated[0].billed_status, 'Match');
  assert.equal(repeated[0].allowed_status, 'Match');
  assert.equal(analysisSources(compared[2]).length, 2);
  assert.equal(analysisCsv(repeated).split('\r\n').length, 2);
  const multi = analyzeClaims([submission, { ...submission, id: 'duplicate-file' }], [remittance, { ...remittance, id: 'duplicate-payer' }]);
  assert.equal(multi.length, 4);
  assert.equal(multi[1].billed_status, 'Match');
  assert.equal(multi[1].occurrences.length, 2);
  const conflict = analyzeClaims([submission, { ...submission, id: 'changed-file', claims: [claim('SYNTHETIC-1002', '658.00', 1)] }], [remittance]);
  assert.equal(conflict[1].billed_status, 'Multiple occurrences — review');
  assert.equal(analysisSources(conflict[1]).length, 2, 'Same filename remains one source label even when content differs');
  const csv = analysisCsv(analyzeClaims(file('837', [claim('=FORMULA', '10.00', 1)]), null));
  assert.ok(csv.includes("'=FORMULA"));
  assert.equal(analysisCsv(compared).split('\r\n').length, 5);

  await act(async () => root.render(React.createElement(Analysis)));
  assert.equal(calls.length, 1, 'Analysis loads only its isolated staging endpoint');
  assert.equal(button('Upload 835').disabled, true);
  assert.equal(document.querySelectorAll('.cu-aging-row').length, 0);
  await upload('837');
  assert.equal(document.querySelector('#analysis-837').value, '');
  assert.ok(document.body.textContent.includes('Ready for another upload'));
  assert.equal(document.querySelectorAll('tbody tr').length, 4);
  assert.equal(button('Upload 835').disabled, false);
  assert.ok(document.body.textContent.includes('Awaiting 835 upload'));
  await upload('835');
  assert.equal(document.querySelectorAll('tbody tr').length, 3, 'one row per claim, including multiple occurrences');
  assert.deepEqual([...document.querySelectorAll('tbody th')].map(cell => cell.rowSpan), [1, 1, 1]);
  assert.ok(document.body.textContent.includes('$20.00'));
  assert.ok(document.body.textContent.includes('Multiple occurrences'));
  assert.equal(document.querySelectorAll('thead th').length, 9);
  assert.equal(document.querySelector('tbody a'), null, 'Staging claims must not link to production claim IDs');
  assert.equal(document.querySelectorAll('tbody button[data-analysis-claim]').length, 3);
  assert.ok(!document.querySelector('table').textContent.includes('submitted-claims.837'));
  assert.ok(!document.querySelector('table').textContent.includes('payer-response.835'));
  assert.equal(document.querySelectorAll('table time').length, 0);
  assert.deepEqual([...document.querySelectorAll('thead th small')].slice(2, 7).map(cell => cell.textContent),
    ['837 · CLM02', '835 · CLP03', '835 · CLP04', '835 · CLP05', '835 · CLP04 + CLP05']);
  const example = document.querySelectorAll('tbody')[1];
  assert.deepEqual([...example.querySelectorAll('.cu-analysis-result strong')].map(cell => cell.textContent), ['Match', 'Match']);
  assert.ok(example.textContent.includes('$657.00'));
  assert.ok(analysisCsv(compared).includes('Allowed comparison status'));
  assert.ok(analysisCsv(compared).includes('Claim payment (835 CLP04)'));
  await click('Download CSV'); assert.deepEqual(downloads, ['filex-analysis_both.csv']);
  await capturePreview(process.env.ANALYSIS_PREVIEW_PATH);
  await act(async () => {
    const input = document.querySelector('input[type="search"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'SYNTHETIC-1003');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Search');
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.equal(document.querySelectorAll('table time').length, 0);
  const duplicateRow = document.querySelector('tbody tr');
  assert.ok(duplicateRow.textContent.includes('Multiple (2)'));
  assert.ok(!duplicateRow.textContent.includes('$90.00'), 'Conflicting amounts belong in the claim detail, not stacked summary lines');
  assert.ok(duplicateRow.textContent.includes('Multiple occurrences'));
  const beforeDetail = calls.length;
  await act(async () => duplicateRow.querySelector('td').click());
  assert.ok(document.querySelector('[aria-label="Analysis claim detail"]'));
  assert.equal(document.querySelector('.cu-analysis-detail h2'), document.activeElement, 'Detail heading receives keyboard focus');
  assert.equal(document.querySelectorAll('.cu-analysis-detail-file').length, 2);
  assert.deepEqual([...document.querySelectorAll('.cu-analysis-detail-file h3')].map(item => item.textContent),
    ['837 submitted-claims.837', '835 payer-response.835']);
  assert.ok(document.querySelector('.cu-analysis-detail').textContent.includes('$80.00'));
  assert.ok(document.querySelector('.cu-analysis-detail').textContent.includes('$90.00'));
  assert.ok(!document.querySelector('.cu-analysis-detail').textContent.includes('$657.00'), 'Other claim amounts must not leak into detail');
  assert.equal(calls.length, beforeDetail, 'Detail uses only the selected Analysis claim, never production endpoints');
  await capturePreview(process.env.ANALYSIS_PREVIEW_PATH?.replace('.html', '-claim.html'));
  await click('← Back to Analysis');
  assert.equal(document.querySelector('input[type="search"]').value, 'SYNTHETIC-1003');
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.equal(document.activeElement.dataset.analysisClaim, 'SYNTHETIC-1003');
  await act(async () => document.activeElement.click());
  assert.ok(document.querySelector('[aria-label="Analysis claim detail"]'), 'Native claim button provides keyboard-accessible navigation');
  await click('← Back to Analysis');
  await click('Clear');
  await click('In 837 only');
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.ok(document.body.textContent.includes('Not in uploaded 835'));
  await act(async () => document.querySelector('tbody button').click());
  assert.equal(document.querySelectorAll('.cu-analysis-detail-file').length, 1);
  assert.ok(document.body.textContent.includes('No matching 835'));
  await click('← Back to Analysis');
  fail = true; await upload('835');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('segment counts'));
  assert.equal(document.querySelector('#analysis-835').value, 'claims.835', 'failed file stays selected');
  assert.equal(document.querySelectorAll('tbody tr').length, 1, 'Failed upload preserves saved comparison and filters');
  assert.equal(button('Retry 835').disabled, false);
  await click('Retry 835');
  assert.equal(document.querySelector('#analysis-835').value, '');
  assert.equal(document.querySelectorAll('tbody tr').length, 3, 'Retry reuses existing file without duplicate rows');
  assert.ok(document.body.textContent.includes('already saved'));
  hold = true; await upload('835');
  assert.equal(button('Upload 837').disabled, true, 'Do not interrupt a database write with another upload');
  assert.equal(button('Upload 835').disabled, true);
  await act(async () => deferred(json({ success: true, saved: true, file: remittance })));
  await upload('837', 'replacement.837');
  await click('In 837 only');
  assert.equal(document.querySelectorAll('tbody tr').length, 2, 'New uploads accumulate alongside existing staging files');
  const before = calls.length;
  await upload('837', 'empty.837', '');
  assert.equal(calls.length, before);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('non-empty'));
  assert.equal(document.querySelectorAll('tbody tr').length, 2);
  assert.equal(document.querySelector('#analysis-837').value, 'empty.837');
  await act(async () => root.render(React.createElement(Analysis, { key: 'reload' })));
  assert.equal(document.querySelectorAll('tbody tr').length, 3, 'Reload restores saved files through paginated GET');
  await click('In 837 only');
  assert.equal(document.querySelectorAll('tbody tr').length, 2);
  failLoad = true;
  await act(async () => root.render(React.createElement(Analysis, { key: 'failed-load' })));
  assert.equal(button('Upload 837').disabled, true);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Loading failed'));
  await click('Retry loading');
  assert.equal(document.querySelectorAll('tbody tr').length, 3);
  assert.equal(localStorage.length, 0, 'Uploaded data must not enter browser storage');
  console.log('Analysis uploads, signed comparisons, duplicate grouping, CSV, filters, validation errors, database-confirmed reset, retry, accumulation and reload persistence passed.');
} finally {
  await act(async () => root.unmount()); await server.close();
  globalThis.fetch = originalFetch; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl;
  window.HTMLAnchorElement.prototype.click = anchorClick; dom.window.close();
}
