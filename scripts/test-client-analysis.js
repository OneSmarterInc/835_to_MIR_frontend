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
const displayedClaim = item => item.dataset.analysisClaim.startsWith('["') ? JSON.parse(item.dataset.analysisClaim)[0] : item.dataset.analysisClaim;
const findClaim = number => [...document.querySelectorAll('[data-analysis-claim]')].find(item => {
  const key = item.dataset.analysisClaim;
  return (key.startsWith('["') ? JSON.parse(key)[0] : key) === number;
});
let fail = false, deferred = null, hold = false, failLoad = false;
let compare, exportCsv, mismatch;
let holdComparison = false, deferredComparison, deferredComparisonResponse;
const comparisonCommits = [];
const summary = ({ claims = [], rejections: _rejections, ...file }) => ({ ...file, accepted_count: file.accepted_count ?? claims.length, rejected_count: file.rejected_count ?? 0 });
const savedFiles = new Map();
const claim = (id, billed, sequence, payment = null, patient_responsibility = null, payment_date = null) => ({ claim: id, billed, sequence, payment, patient_responsibility, payment_date, internal_number: 'REF-TEST' });
const file = (kind, claims) => ({ id: 'file-' + kind, filename: kind === '837' ? 'submitted-claims.837' : 'payer-response.835', kind, uploaded_at: '2026-10-17T12:00:00Z', claims });
const submission = file('837', [claim('SYNTHETIC-1001', '100.00', 1), claim('SYNTHETIC-1002', '657.00', 2),
  claim('SYNTHETIC-1003', '80.00', 3), claim('SYNTHETIC-1003', '90.00', 4), claim('SYNTHETIC-1004', '45.00', 5)]);
const remittance = file('835', [claim('SYNTHETIC-1001', '80.00', 1, '50.00', '20.00'), claim('SYNTHETIC-1002', '657.00', 2, '0.00', '657.00'), claim('SYNTHETIC-1003', '80.00', 3, '60.00', '20.00'), claim('NOT-IN-837', '10.00', 4, '10.00', '0.00')]);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
// Exercise the XHR transport through the same synthetic server as read APIs.
globalThis.XMLHttpRequest = class {
  upload = {}; headers = {}; controller = new AbortController();
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  getResponseHeader() { return 'application/json'; }
  abort() { this.controller.abort(); this.onabort?.(); }
  async send(body) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    this.upload.onload?.();
    try {
      const response = await fetch(this.url, { method: this.method, body, headers: this.headers,
        credentials: this.withCredentials ? 'include' : 'omit', signal: this.controller.signal });
      this.status = response.status; this.responseText = await response.text();
      if (!this.controller.signal.aborted) this.onload?.();
    } catch { this.onerror?.(); }
  }
};
URL.createObjectURL = () => 'blob:analysis'; URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
globalThis.fetch = async (url, options) => {
  assert.ok(url.startsWith('/edi835/api/client-portal/analysis/'));
  assert.equal(options.credentials, 'include'); calls.push({ ...options, url });
  if (options.method !== 'POST') {
    if (url.includes('csrf_only')) return json({ success: true, csrf_token: 'test-csrf' });
    if (failLoad) { failLoad = false; return json({ success: false, error: 'Loading failed' }, 503); }
    const params = new URL(url, 'http://localhost').searchParams;
    const files = [...savedFiles.values()];
    const rows = compare(files.filter(file => file.kind === '837'), files.filter(file => file.kind === '835'));
    const view = params.get('view');
    if (view === 'claim') return rows.some(row => row.key === params.get('claim') || row.claim === params.get('claim'))
      ? json({ success: true, row: rows.find(row => row.key === params.get('claim') || row.claim === params.get('claim')) })
      : json({ success: false, error: 'Claim not found.' }, 404);
    if (view === 'rejections' || view === 'rejection-export') {
      const file = savedFiles.get(params.get('upload'));
      assert.ok(file, 'Report requested for unknown upload');
      return view === 'rejections' ? json({ success: true, rejections: file.rejections || [], total: file.rejected_count || 0 })
        : new Response('Claim occurrence,Reason\r\n2,Invalid amount', { headers: { 'Content-Type': 'text/csv' } });
    }
    assert.ok(['comparison', 'export', 'excel'].includes(view), 'Must not fetch saved file history');
    const category = params.get('category') === 'auto' ? files.some(file => file.kind === '835') ? 'both' : '837-only' : params.get('category');
    const search = (params.get('search') || '').toUpperCase();
    const found = rows.filter(row => !search || row.claim.includes(search) || row.occurrences.some(item =>
      item.internal_number.toUpperCase().includes(search) || item.filename.toUpperCase().includes(search)));
    const matched = row => row.category === 'both' && row.allowed_status === 'Match';
    const counts = { both: found.filter(mismatch).length, matched: found.filter(matched).length, '837-only': found.filter(row => row.category === '837-only').length };
    const filtered = found.filter(row => category === 'both' ? mismatch(row) : category === 'matched' ? matched(row) : row.category === '837-only');
    const sort = params.get('sort') || 'claim', direction = params.get('direction') === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      const av = a[sort], bv = b[sort];
      if (av == null || bv == null) return av === bv ? a.claim.localeCompare(b.claim) : av == null ? 1 : -1;
      const order = ['claim', 'internal_number'].includes(sort) ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv);
      return order * direction || a.claim.localeCompare(b.claim);
    });
    if (view === 'excel') return new Response('workbook tested by backend', { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    if (view === 'export') return new Response(exportCsv(filtered), { headers: { 'Content-Type': 'text/csv' } });
    const size = Number(params.get('page_size') || 10), pages = Math.max(1, Math.ceil(filtered.length / size));
    const page = Math.min(Number(params.get('page') || 1), pages);
    const pageRows = filtered.slice((page - 1) * size, page * size).map(row => {
      const refs = [...new Set(row.occurrences.map(item => item.internal_number).filter(Boolean))];
      const display_amounts = Object.fromEntries(['billed_837', 'billed_835', 'payment', 'patient_responsibility', 'allowed'].map(key => {
        const values = [...new Set(row.occurrences.filter(item => item.source_type === (key === 'billed_837' ? '837' : '835')).map(item => item[key]))];
        return [key, key === 'billed_837' ? { count: values.length, value: values[0] ?? null } : { count: row.category === 'both' ? 1 : 0, value: row[key] }];
      }));
      return { ...row, occurrences: [], source_837: '', source_835: '', reference_count: refs.length, display_amounts,
        denial_codes: row.category === 'both' && row.claim === 'SYNTHETIC-1001' ? ['CO-45', 'PR-1', 'OA-99999'] : [],
        denial_reasons: [{ code: 'PR-1', reason: 'Deductible Amount' }, { code: 'OA-99999', reason: null }],
        carc_codes: row.claim === 'SYNTHETIC-1001' ? [{ code: '1', description: 'Deductible Amount' }, { code: '99999', description: null }] : [],
        rarc_codes: row.claim === 'SYNTHETIC-1001' ? [{ code: 'N643', description: 'Not covered' }] : [] };
    });
    const response = json({ success: true, rows: pageRows, total: filtered.length, counts, page, pages, category,
      file_counts: { '837': files.filter(file => file.kind === '837').length, '835': files.filter(file => file.kind === '835').length } });
    if (holdComparison) {
      holdComparison = false; deferredComparisonResponse = response;
      return new Promise(resolve => { deferredComparison = resolve; });
    }
    return response;
  }
  assert.equal(options.headers['X-CSRFToken'], 'test-csrf');
  assert.equal(options.body.getAll('file').length, 1);
  if (hold) { hold = false; return new Promise(resolve => { deferred = resolve; }); }
  if (fail) { fail = false; return json({ success: false, error: 'ST/SE segment counts do not agree.' }, 400); }
  const replacement = options.body.get('file').name === 'replacement.837';
  const batchName = options.body.get("file").name;
  const batchKind = options.body.get("kind");
  const saved = batchName.startsWith("batch-") ? { ...file(batchKind, [claim(batchName.split(".")[0].toUpperCase(), batchKind === "837" ? "100.00" : "90.00", 1, "70.00", "10.00")]), id: batchName, filename: batchName } : replacement ? { ...file('837', [claim('REPLACEMENT', '20.00', 1)]), id: 'another-837', filename: 'replacement.837' } : options.body.get('kind') === '837' ? submission : remittance;
  const reused = savedFiles.has(saved.id);
  savedFiles.set(saved.id, saved);
  assert.equal(new URL(url, 'http://localhost').searchParams.get('compact'), '1');
  return json({ success: true, saved: true, reused, file: summary(saved) });
};
const button = text => {
  const result = [...document.querySelectorAll('button')].find(item => item.textContent === text || item.textContent.startsWith(text));
  assert.ok(result, 'Missing button ' + text); return result;
};
const click = async text => act(async () => button(text).click());
const upload = async (kind, name = `claims.${kind}`, contents = 'synthetic content') => uploadMany(kind, [new File([contents], name)]);
const uploadMany = async (kind, selected) => act(async () => {
  const input = document.querySelector(`#analysis-${kind}`);
  Object.defineProperty(input, 'files', { configurable: true, value: selected });
  Object.defineProperty(input, 'value', { configurable: true, writable: true, value: selected.map(file => file.name).join(', ') });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
const uploadCounts = kind => Object.fromEntries([...document.querySelectorAll(`[aria-label="${kind} upload status"] [data-stage]`)]
  .map(item => [item.dataset.stage, Number(item.querySelector('b').textContent)]));
async function capturePreview(path, markup = document.getElementById('root').innerHTML) {
  if (path) {
    const fs = await import('node:fs/promises');
    const styles = await Promise.all(['src/index.css', 'src/pages/ClientUserPortal.css', 'src/components/ClientClaimComparison.css', 'src/components/Client835837Status.css', 'src/components/ClientAnalysis.css'].map(path => fs.readFile(path, 'utf8')));
    await fs.writeFile(path, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Analysis preview</title><style>${styles.join('\n')}</style></head><body><div class="cu-shell"><main class="cu-main cu-compact"><header class="cu-heading"><div class="cu-heading-copy"><span class="eyebrow">Example client</span><h1>Analysis</h1></div></header>${markup}</main></div></body></html>`);
  }
}
try {
  const { default: Analysis } = await server.ssrLoadModule('/src/components/ClientAnalysis.tsx');
  const { analyzeClaims, analysisCsv, analysisSources, isAnalysisMismatch } = await server.ssrLoadModule('/src/utils/claimAnalysis.ts');
  compare = analyzeClaims; exportCsv = analysisCsv; mismatch = isAnalysisMismatch;
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
  const totalSources = [
    { ...file('835', [claim('TOTAL', '400.00', 1, '350.00', '50.00', '2026-09-01')]), id: 'first', filename: 'first.835' },
    { ...file('835', [claim('TOTAL', '624.00', 1, '200.00', '24.00', '2026-09-02')]), id: 'second', filename: 'second.835' },
  ];
  const totals = analyzeClaims(file('837', [claim('TOTAL', '624.00', 1)]), totalSources)[0];
  assert.deepEqual([totals.billed_835, totals.payment, totals.patient_responsibility, totals.allowed], ['624.00', '550.00', '74.00', '624.00']);
  assert.equal(totals.billed_status, 'Match');
  assert.equal(totals.allowed_status, 'Match');
  assert.equal(totals.ambiguous, false);
  assert.equal(totals.occurrences.length, 3);
  assert.equal(totals.reference_count, 1);
  const paidSources = [
    { ...file('835', [{ ...claim('PAID', '117.00', 1, '117.00', '0.00', '2026-09-16'), internal_number: ' ref ' }]), id: 'first', filename: 'first-upload.835', uploaded_at: '2026-10-17T12:00:00Z' },
    { ...file('835', [{ ...claim('PAID', '624.00', 1, '507.00', '20.00', '2026-09-08'), internal_number: 'REF' }]), id: 'second', filename: 'second-upload.835', uploaded_at: '2026-10-17T12:01:00Z' },
  ];
  const paid = analyzeClaims(file('837', [claim('PAID', '624.00', 1)]), [...paidSources].reverse())[0];
  assert.equal(paid.reference_count, 1, 'Identical complete references display once');
  assert.deepEqual(paid.internal_numbers, ['REF']);
  assert.equal(paid.billed_835, '624.00', 'Upload time determines latest, not payment date or array order');
  assert.equal(paid.allowed, '644.00');
  assert.equal(paid.allowed_status, 'Match');
  assert.equal(paid.allowed_basis, 'payment');
  assert.equal(paid.allowed_difference, '0.00');
  const undated = analyzeClaims(file('837', [claim('PAID', '624.00', 1)]), [
    paidSources[0], { ...paidSources[1], claims: [{ ...paidSources[1].claims[0], payment_date: null }] },
  ])[0];
  assert.equal(undated.billed_835, '624.00');
  const tied = analyzeClaims(file('837', [claim('PAID', '624.00', 1)]), [
    { ...paidSources[1], claims: [paidSources[0].claims[0], { ...paidSources[1].claims[0], sequence: 2 }] },
  ])[0];
  assert.equal(tied.billed_835, '624.00', 'Final CLP sequence supplies its own charge amount');
  const smaller = analyzeClaims(file('837', [claim('PAID', '624.00', 1)]), [
    paidSources[0], { ...paidSources[1], claims: [{ ...paidSources[1].claims[0], billed: '4.00' }] },
  ])[0];
  assert.equal(smaller.billed_835, '4.00', 'Never choose a sum or maximum CLP03');
  const separate = analyzeClaims(file('837', [claim('PAID', '624.00', 1)]), [
    paidSources[0], { ...paidSources[1], claims: [{ ...paidSources[1].claims[0], internal_number: 'DIFFERENT' }] },
  ]);
  assert.equal(separate.length, 1, 'One parent claim row lists both internal IDs');
  assert.equal(separate[0].internal_numbers.length, 2);
  assert.equal(separate[0].payment, '624.00');
  assert.equal(separate[0].allowed_status, 'Match');
  const reversed = analyzeClaims(file('837', [claim('PAID', '624.00', 1)]), [
    paidSources[0], { ...paidSources[1], claims: [{ ...paidSources[1].claims[0], claim_status: '22', billed: '-117.00', payment: '-117.00' }] },
  ])[0];
  assert.equal(reversed.billed_status, 'Reversed — review');
  assert.equal(reversed.allowed_status, 'Reversed — review');
  assert.ok(analysisCsv([totals]).includes('"624.00","624.00","550.00","74.00","624.00"'));
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: TotalsTable } = await server.ssrLoadModule('/src/components/AnalysisComparisonTable.tsx');
  const totalHtml = renderToStaticMarkup(React.createElement(TotalsTable, {
    rows: [totals], sort: 'claim', direction: 'asc', onSort() {}, onOpenClaim() {}, emptyMessage: '',
  }));
  assert.ok(totalHtml.includes('$550.00') && totalHtml.includes('$74.00'));
  assert.ok(!totalHtml.includes('Multiple occurrences') && !totalHtml.includes('Multiple ('));
  const distinctHtml = renderToStaticMarkup(React.createElement(TotalsTable, {
    rows: [{ ...paid, internal_numbers: ['FIRST', 'SECOND'], reference_count: 2 }], sort: 'claim', direction: 'asc', onSort() {}, onOpenClaim() {}, emptyMessage: '',
  }));
  assert.ok(!distinctHtml.includes('Multiple ('));
  const referencesDom = new JSDOM(distinctHtml);
  assert.equal(referencesDom.window.document.querySelectorAll('.cu-analysis-references > span').length, 2);
  assert.equal(referencesDom.window.document.querySelectorAll('thead th').length, 7);
  assert.ok(!referencesDom.window.document.querySelector('thead').textContent.includes('835 billed'));
  assert.ok(!referencesDom.window.document.querySelector('thead').textContent.includes('Billed comparison'));
  const { default: ClaimDetail } = await server.ssrLoadModule('/src/components/AnalysisClaimDetail.tsx');
  const detailDom = new JSDOM(renderToStaticMarkup(React.createElement(ClaimDetail, { row: separate[0], onBack() {} })));
  const internalSections = [...detailDom.window.document.querySelectorAll('.cu-internal-claim')];
  assert.equal(internalSections.length, 2, 'Each full internal ID has its own detail section');
  assert.deepEqual(internalSections.map(section => section.querySelectorAll('tbody tr').length), [1, 1]);
  assert.ok(internalSections.some(section => section.textContent.includes('$507.00')));
  assert.ok(internalSections.some(section => section.textContent.includes('$117.00')));
  assert.ok(detailDom.window.document.querySelector('.cu-analysis-detail-summary').textContent.includes('$624.00'));
  await capturePreview(process.env.ANALYSIS_PREVIEW_PATH?.replace('.html', '-internal.html'), detailDom.window.document.body.innerHTML);
  const signedTotal = analyzeClaims(file('837', [claim('SIGNED-TOTAL', '100.00', 1)]), [
    { ...file('835', [claim('SIGNED-TOTAL', '120.00', 1, '100.00', '20.00')]), filename: 'first.835' },
    { ...file('835', [claim('SIGNED-TOTAL', '-20.00', 1, '-10.00', '-10.00')]), filename: 'second.835' },
  ])[0];
  assert.equal(signedTotal.allowed, '100.00');
  assert.equal(signedTotal.allowed_status, 'Match');
  const unknownTotal = analyzeClaims(file('837', [claim('TOTAL', '624.00', 1)]), [
    totalSources[0], { ...totalSources[1], claims: [claim('TOTAL', '624.00', 1, '200.00', null, '2026-09-02')] },
  ])[0];
  assert.equal(unknownTotal.billed_status, 'Match');
  assert.equal(unknownTotal.allowed_status, 'Amount unavailable');
  assert.equal(unknownTotal.patient_responsibility, null);
  const compared = analyzeClaims(submission, remittance);
  assert.equal(compared.length, 4);
  assert.equal(compared[0].difference, '20.00');
  assert.equal(compared[2].occurrences.length, 3);
  assert.equal(compared[2].difference, null);
  assert.equal(compared[2].ambiguous, true);
  assert.equal(compared[3].category, '837-only');
  assert.ok(!compared.some(row => row.claim === 'NOT-IN-837'));
  const internalOnly = analyzeClaims(file('837', [{ ...claim('REFERENCE', '100.00', 1), internal_number: 'SUBMISSION-REF' }]),
    file('835', [{ ...claim('REFERENCE', '80.00', 1, '50.00', '0.00'), internal_number: 'PAYER-REF' }]))[0];
  assert.equal(internalOnly.internal_number, 'PAYER-REF');
  assert.equal(internalOnly.occurrences.find(item => item.source_type === '837').internal_number, '');
  assert.ok(!analysisCsv([internalOnly]).includes('SUBMISSION-REF'));
  assert.ok(analysisCsv([internalOnly]).includes('PAYER-REF'));
  assert.equal(compared[3].internal_number, '', 'An 837-only claim has no 835 internal number');
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
  // Persisted backend recovery must render real zero responsibility, not a dash.
  const recovered = analyzeClaims(file('837', [claim('RECOVERED', '2483.00', 1)]),
    file('835', [claim('RECOVERED', '2483.00', 1, '284.77', '0.00')]))[0];
  assert.equal(recovered.billed_status, 'Match');
  assert.equal(recovered.allowed_status, 'Mismatch');
  assert.equal(recovered.allowed, '284.77');
  assert.equal(recovered.allowed_difference, '2198.23');
  const { default: UploadResults } = await server.ssrLoadModule('/src/components/AnalysisUploadResults.tsx');
  const partialFile = { ...submission, claims: submission.claims.slice(0, 2), accepted_count: 2, rejected_count: 1, status: 'PARTIAL',
    rejections: [{ sequence: 2, claim_number: 'REJECTED', reason: 'Claim occurrence 2 has an invalid CLM02 amount.' }] };
  savedFiles.set(partialFile.id, partialFile);
  await act(async () => root.render(React.createElement(UploadResults, { files: [summary(partialFile)], kind: '837' })));
  assert.match(document.querySelector('[aria-label="837 claim results"]').textContent, /Claims accepted 2.*Claims rejected 1/);
  assert.equal(calls.length, 0, 'Rejection details are not fetched with counts');
  await act(async () => {
    const details = document.querySelector('details'); details.open = true; details.dispatchEvent(new Event('toggle'));
  });
  assert.match(document.querySelector('details').textContent, /Claim occurrence 2 has an invalid CLM02 amount/);
  await click('Download rejection report');
  assert.equal(downloads.at(-1), 'submitted-claims.837-rejections.csv');
  downloads.length = 0;
  calls.length = 0; savedFiles.clear();
  await act(async () => root.render(null));

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

  await act(async () => root.render(React.createElement(React.Profiler, { id: 'analysis', onRender: () => {
    // Observe every committed render, including the one before passive fetch effects.
    comparisonCommits.push({
      active: document.querySelector('[aria-label="Claim status"] [aria-pressed="true"]')?.textContent,
      claims: [...document.querySelectorAll('[data-analysis-claim]')].map(displayedClaim),
    });
  } }, React.createElement(Analysis))));
  assert.equal(calls.length, 1, 'Analysis loads only its isolated staging endpoint');
  assert.equal(button('Upload 835').disabled, false);
  assert.equal(document.querySelectorAll('.cu-aging-row').length, 0);
  await upload('837');
  assert.equal(document.querySelector('#analysis-837').value, '');
  assert.ok(document.body.textContent.includes('Ready for another upload'));
  assert.equal(document.querySelectorAll('tbody tr').length, 4);
  assert.equal(button('Upload 835').disabled, false);
  assert.ok(document.body.textContent.includes('Awaiting 835 upload'));
  await upload('835');
  assert.equal(document.querySelectorAll('tbody tr').length, 2, 'Only mismatches and unresolved comparisons are shown');
  assert.deepEqual([...document.querySelectorAll('tbody th')].map(cell => cell.rowSpan), [1, 1]);
  assert.ok(document.body.textContent.includes('$20.00'));
  assert.ok(document.body.textContent.includes('Multiple occurrences'));
  assert.equal(document.querySelectorAll('thead th').length, 10);
  assert.equal(document.querySelector('thead th:nth-last-child(3)').textContent, 'CAS');
  assert.deepEqual([...findClaim('SYNTHETIC-1001').closest('tr').querySelectorAll('.cu-analysis-cas-codes div')].map(item => item.textContent), ['CO-45', 'PR-1', 'OA-99999']);
  assert.equal(document.querySelector('thead th:last-child').textContent, 'RARC code');
  assert.match(document.querySelector('thead th:nth-last-child(2)').textContent, /CARC code.*835 · CAS/);
  const codeTips = [...findClaim('SYNTHETIC-1001').closest('tr').querySelectorAll('.cu-analysis-code')];
  assert.deepEqual(codeTips.map(item => item.textContent), ['1', '99999', 'N643']);
  assert.deepEqual(codeTips.map(item => item.title), ['Deductible Amount', 'Description unavailable', 'Not covered']);
  assert.ok(codeTips.every(item => item.tabIndex === 0 && item.getAttribute('aria-label').includes(item.title)));
  assert.equal(findClaim('SYNTHETIC-1003').closest('tr').querySelector('.cu-analysis-denial-codes').textContent, '—');
  assert.equal(document.querySelectorAll('thead th small')[1].textContent, '835 · CLP07');
  assert.equal(document.querySelector('tbody a'), null, 'Staging claims must not link to production claim IDs');
  assert.equal(document.querySelectorAll('tbody button[data-analysis-claim]').length, 2);
  assert.ok(!document.querySelector('table').textContent.includes('submitted-claims.837'));
  assert.ok(!document.querySelector('table').textContent.includes('payer-response.835'));
  assert.equal(document.querySelectorAll('table time').length, 0);
  assert.deepEqual([...document.querySelectorAll('thead th small')].slice(2, 6).map(cell => cell.textContent),
    ['837 · CLM02', '835 · CLP04 total', '835 · CLP05 / PR total', '835 · Payment + responsibility totals']);
  assert.equal(findClaim('SYNTHETIC-1002'), undefined, 'Both-match claim excluded from table');
  assert.deepEqual(compared.filter(isAnalysisMismatch).map(row => row.claim), ['SYNTHETIC-1001', 'SYNTHETIC-1003']);
  assert.ok(!analysisCsv(compared.filter(isAnalysisMismatch)).includes('SYNTHETIC-1002'));
  for (const [billed, allowed, expected] of [['Match', 'Mismatch', true], ['Mismatch', 'Match', false], ['Match', 'Match', false], ['Match', 'Amount unavailable', true]]) {
    assert.equal(isAnalysisMismatch({ ...compared[0], billed_status: billed, allowed_status: allowed }), expected);
  }
  assert.ok(button('Mismatch amount').textContent.endsWith('2'));
  assert.ok(button('Missing in 835').textContent.endsWith('1'));
  assert.ok(analysisCsv(compared).includes('Allowed comparison status'));
  assert.ok(analysisCsv(compared).includes('Claim payment (835 CLP04)'));
  await click('Download Excel'); assert.deepEqual(downloads, ['Claims-Reconciliation.xlsx']);
  assert.ok(button('Download Excel').querySelector('svg[aria-hidden="true"]'), 'Excel icon accompanies its accessible text');
  assert.deepEqual([...document.querySelectorAll('[aria-label="Claim status"] button')].map(item => item.childNodes[0].textContent.trim()),
    ['Mismatch amount', 'Matched amount', 'Missing in 835']);
  assert.ok(button('Matched amount').textContent.endsWith('1'));
  comparisonCommits.length = 0;
  const previousRowCount = document.querySelectorAll('[data-analysis-claim]').length;
  holdComparison = true;
  await click('Matched amount');
  assert.equal(document.querySelectorAll('thead th').length, 7);
  assert.equal(document.querySelector('.cu-analysis-denial-heading'), null);
  assert.equal(document.querySelectorAll('[data-analysis-claim]').length, 0, 'Old claims disappear immediately while the new tab loads');
  assert.equal(document.querySelectorAll('.cu-analysis-skeleton tr').length, previousRowCount, 'Loading preserves the existing row slots');
  assert.equal(button('Download Excel').disabled, true);
  assert.equal(document.querySelector('[aria-label="Uploaded claim comparison"]').getAttribute('aria-busy'), 'true');
  assert.ok(comparisonCommits.length > 0);
  assert.ok(comparisonCommits.every(commit => commit.active.startsWith('Matched amount') && commit.claims.length === 0),
    'No committed render may show mismatch rows under the matched tab, even before the fetch effect');
  await act(async () => deferredComparison(deferredComparisonResponse));
  assert.equal(document.querySelector('.cu-analysis-skeleton'), null);
  assert.ok(calls.at(-1).url.includes('category=matched'));
  assert.equal(button('Matched amount').getAttribute('aria-pressed'), 'true');
  assert.deepEqual([...document.querySelectorAll('[data-analysis-claim]')].map(displayedClaim), ['SYNTHETIC-1002']);
  assert.deepEqual([...document.querySelectorAll('.cu-analysis-result strong')].map(item => item.textContent), ['Match']);
  await click('Download Excel');
  assert.equal(downloads.at(-1), 'Claims-Reconciliation.xlsx');
  await act(async () => document.querySelector('[data-analysis-claim]').click());
  assert.ok(document.querySelector('[aria-label="Analysis claim detail"]'));
  await click('← Back to Analysis');
  assert.equal(button('Matched amount').getAttribute('aria-pressed'), 'true');
  await capturePreview(process.env.ANALYSIS_PREVIEW_PATH?.replace('.html', '-matched.html'));
  holdComparison = true;
  await click('Missing in 835');
  assert.equal(document.querySelectorAll('thead th').length, 7);
  assert.equal(document.querySelector('.cu-analysis-denial-heading'), null);
  assert.equal(document.querySelectorAll('[data-analysis-claim]').length, 0);
  const abandonedRequest = calls.at(-1), resolveAbandoned = deferredComparison, abandonedResponse = deferredComparisonResponse;
  await click('Matched amount');
  assert.equal(abandonedRequest.signal.aborted, true);
  await act(async () => resolveAbandoned(abandonedResponse));
  assert.deepEqual([...document.querySelectorAll('[data-analysis-claim]')].map(displayedClaim), ['SYNTHETIC-1002'],
    'Rapid tab switches cannot display a late response for the abandoned tab');
  holdComparison = true;
  await click('Missing in 835');
  await act(async () => deferredComparison(json({ success: false, error: 'Loading failed' }, 503)));
  assert.equal(document.querySelectorAll('[data-analysis-claim]').length, 0, 'Failed tab loads do not restore rows from another tab');
  assert.equal(document.querySelector('.cu-analysis-skeleton'), null);
  await click('Retry loading');
  assert.deepEqual([...document.querySelectorAll('[data-analysis-claim]')].map(displayedClaim), ['SYNTHETIC-1004']);
  await click('Mismatch amount');
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
  assert.equal(document.querySelectorAll('.cu-claim-source').length, 2);
  assert.deepEqual([...document.querySelectorAll('.cu-claim-source h4')].map(item => item.textContent),
    ['payer-response.835', 'submitted-claims.837']);
  assert.equal(document.querySelectorAll('.cu-internal-claim').length, 1);
  assert.ok(document.querySelector('.cu-internal-claim summary').textContent.includes('Internal claim'));
  assert.ok(document.querySelector('.cu-analysis-detail').textContent.includes('$80.00'));
  assert.ok(document.querySelector('.cu-analysis-detail').textContent.includes('$90.00'));
  assert.ok(!document.querySelector('.cu-analysis-detail').textContent.includes('$657.00'), 'Other claim amounts must not leak into detail');
  assert.equal(calls.length, beforeDetail + 1, 'Detail loads only on demand');
  assert.equal(new URL(calls.at(-1).url, 'http://localhost').searchParams.get('claim'), 'SYNTHETIC-1003');
  await capturePreview(process.env.ANALYSIS_PREVIEW_PATH?.replace('.html', '-claim.html'));
  await click('← Back to Analysis');
  assert.equal(document.querySelector('input[type="search"]').value, 'SYNTHETIC-1003');
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.equal(document.activeElement.dataset.analysisClaim, 'SYNTHETIC-1003');
  await act(async () => document.activeElement.click());
  assert.ok(document.querySelector('[aria-label="Analysis claim detail"]'), 'Native claim button provides keyboard-accessible navigation');
  await click('← Back to Analysis');
  await click('Clear');
  await click('Missing in 835');
  assert.equal(document.querySelectorAll('tbody tr').length, 1);
  assert.ok(document.body.textContent.includes('Not in uploaded 835'));
  await act(async () => document.querySelector('tbody button').click());
  assert.equal(document.querySelectorAll('.cu-claim-source').length, 1);
  assert.ok(document.body.textContent.includes('No matching 835'));
  await click('← Back to Analysis');
  fail = true; await upload('835');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('segment counts'));
  assert.equal(document.querySelector('#analysis-835').value, 'claims.835', 'failed file stays selected');
  assert.equal(document.querySelectorAll('tbody tr').length, 1, 'Failed upload preserves saved comparison and filters');
  assert.equal(button('Retry 835').disabled, false);
  await click('Retry 835');
  assert.equal(document.querySelector('#analysis-835').value, '');
  assert.equal(button('Missing in 835').getAttribute('aria-pressed'), 'true', 'Successful uploads preserve the selected filter');
  await click('Mismatch amount');
  assert.equal(document.querySelectorAll('tbody tr').length, 2, 'Retry reuses existing file without duplicate rows');
  assert.ok(document.body.textContent.includes('already saved'));
  hold = true; await upload('835');
  assert.equal(button('Upload 837').disabled, false, 'Other source can upload while 835 is saving');
  assert.equal(button('Upload 835').disabled, true);
  assert.deepEqual(uploadCounts('835'), { queued: 0, uploading: 0, processing: 1, saved: 0, failed: 0 });
  await upload('837', 'replacement.837');
  assert.deepEqual(uploadCounts('837'), { queued: 0, uploading: 0, processing: 0, saved: 1, failed: 0 });
  assert.deepEqual(uploadCounts('835'), { queued: 0, uploading: 0, processing: 1, saved: 0, failed: 0 });
  assert.equal(button('Upload 835').disabled, true);
  await act(async () => deferred(json({ success: true, saved: true, file: summary(remittance) })));
  await click('Missing in 835');
  assert.equal(document.querySelectorAll('tbody tr').length, 2, 'New uploads accumulate alongside existing staging files');
  const before = calls.length;
  await upload('837', 'empty.837', '');
  assert.equal(calls.length, before);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('non-empty'));
  assert.equal(document.querySelectorAll('tbody tr').length, 2);
  assert.equal(document.querySelector('#analysis-837').value, 'empty.837');
  await act(async () => root.render(React.createElement(Analysis, { key: 'reload' })));
  assert.equal(document.querySelectorAll('tbody tr').length, 2, 'Reload restores saved files through paginated GET');
  await click('Missing in 835');
  assert.equal(document.querySelectorAll('tbody tr').length, 2);
  failLoad = true;
  await act(async () => root.render(React.createElement(Analysis, { key: 'failed-load' })));
  assert.equal(button('Upload 837').disabled, true);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Loading failed'));
  await click('Retry loading');
  assert.equal(document.querySelectorAll('tbody tr').length, 2);
  savedFiles.clear();
  await act(async () => root.render(React.createElement(Analysis, { key: '835-first' })));
  assert.equal(button('Upload 835').disabled, false);
  assert.equal(button('Upload 837').disabled, false);
  assert.equal(document.querySelector('#analysis-837').multiple, true);
  assert.equal(document.querySelector('#analysis-835').multiple, true);
  assert.ok(!document.querySelector('.cu-analysis-steps').textContent.includes('1 ·'));
  await upload('835');
  assert.ok(savedFiles.has('file-835'), '835 saves before any 837');
  assert.equal(document.querySelector('#analysis-835').value, '');
  await act(async () => root.render(React.createElement(Analysis, { key: '835-first-reload' })));
  await upload('837');
  await click('Mismatch amount');
  assert.equal(document.querySelectorAll('tbody tr').length, 2, 'Matching works with 835-first upload order after reload');

  for (const kind of ['837', '835']) {
    assert.equal(document.querySelector(`#analysis-${kind}`).hasAttribute('accept'), false,
      'Extensionless X12 files must be available in the native picker');
    await upload(kind, `CLAIMS_${kind}_20261017`);
    assert.equal(calls.filter(call => call.method === 'POST').at(-1).body.get('file').name, `CLAIMS_${kind}_20261017`);
    assert.equal(document.querySelector(`#analysis-${kind}`).value, '', 'Successful extensionless upload clears the picker');
    assert.deepEqual(uploadCounts(kind), { queued: 0, uploading: 0, processing: 0, saved: 1, failed: 0 });
  }

  const batchStart = calls.length;
  fail = true;
  await uploadMany('837', [new File(['synthetic'], 'batch-a.837'), new File(['synthetic'], 'batch-b.837')]);
  assert.deepEqual(uploadCounts('837'), { queued: 0, uploading: 0, processing: 0, saved: 1, failed: 1 });
  assert.ok(!savedFiles.has('batch-a.837'));
  assert.ok(savedFiles.has('batch-b.837'), 'Later files continue after an earlier validation failure');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('batch-a.837'));
  assert.ok(document.querySelector('#analysis-837').value.length > 0, 'Partial failure keeps selection for retry');
  assert.equal(document.querySelector('label[for="analysis-837"]').parentElement.querySelector('p').textContent, 'batch-a.837');
  await click('Retry 837');
  assert.ok(savedFiles.has('batch-a.837'));
  assert.equal(document.querySelector('#analysis-837').value, '');
  assert.deepEqual(calls.slice(batchStart).filter(call => call.method === 'POST').map(call => call.body.get('file').name),
    ['batch-a.837', 'batch-b.837', 'batch-a.837'], 'Retry sends only failed files');
  await uploadMany('835', [new File(['synthetic'], 'batch-a.835'), new File(['synthetic'], 'batch-b.835')]);
  assert.ok(savedFiles.has('batch-a.835') && savedFiles.has('batch-b.835'));
  assert.equal(document.querySelector('#analysis-835').value, '');
  assert.equal(document.querySelectorAll('tbody tr').length, 4);
  assert.ok(!document.querySelector('table').textContent.includes('$657.00'));
  const liveStart = calls.length;
  hold = true;
  await uploadMany('835', ['batch-live-a.835', 'batch-live-b.835', 'batch-live-c.835'].map(name => new File(['synthetic'], name)));
  assert.deepEqual(uploadCounts('835'), { queued: 2, uploading: 0, processing: 1, saved: 0, failed: 0 });
  assert.ok(document.querySelector('[aria-label="835 upload status"]').textContent.includes('batch-live-a.835'));
  await capturePreview(process.env.ANALYSIS_PREVIEW_PATH?.replace('.html', '-progress.html'));
  hold = true;
  await act(async () => deferred(json({ success: false, error: 'Database write failed' }, 503)));
  assert.deepEqual(uploadCounts('835'), { queued: 1, uploading: 0, processing: 1, saved: 0, failed: 1 });
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Database write failed'), 'Failure is visible before the remaining queue finishes');
  assert.ok(document.querySelector('[aria-label="835 upload status"]').textContent.includes('batch-live-b.835'));
  const liveSaved = { ...file('835', [claim('BATCH-LIVE-B', '90.00', 1, '70.00', '10.00')]), id: 'batch-live-b.835', filename: 'batch-live-b.835' };
  savedFiles.set(liveSaved.id, liveSaved);
  await act(async () => deferred(json({ success: true, saved: true, file: summary(liveSaved) })));
  assert.deepEqual(uploadCounts('835'), { queued: 0, uploading: 0, processing: 0, saved: 2, failed: 1 });
  assert.match(document.querySelector('[aria-label="835 claim results"]').textContent, /Claims accepted 2.*Claims rejected 0/,
    'Batch totals exclude historical uploads and failed requests');
  assert.equal(document.querySelector('.cu-analysis-processing-file'), null);
  await click('Retry 835');
  assert.deepEqual(uploadCounts('835'), { queued: 0, uploading: 0, processing: 0, saved: 1, failed: 0 });
  assert.match(document.querySelector('[aria-label="835 claim results"]').textContent, /Claims accepted 1.*Claims rejected 0/,
    'Retry totals include only files processed by that retry');
  assert.equal(document.querySelector('#analysis-835').value, '');
  assert.deepEqual(calls.slice(liveStart).filter(call => call.method === 'POST').map(call => call.body.get('file').name),
    ['batch-live-a.835', 'batch-live-b.835', 'batch-live-c.835', 'batch-live-a.835']);
  savedFiles.clear();
  await act(async () => root.render(React.createElement(Analysis, { key: 'partial-upload' })));
  hold = true;
  await upload('837', 'partial.837');
  savedFiles.set(partialFile.id, partialFile);
  await act(async () => deferred(json({ success: true, saved: true, file: summary(partialFile) })));
  assert.equal(document.querySelector('#analysis-837').value, '', 'A committed partial file clears the picker');
  assert.match(document.querySelector('[aria-label="837 claim results"]').textContent, /Claims accepted 2.*Claims rejected 1/);
  assert.deepEqual(uploadCounts('837'), { queued: 0, uploading: 0, processing: 0, saved: 1, failed: 0 });
  await act(async () => {
    const details = document.querySelector('.cu-analysis-rejections'); details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
  await capturePreview(process.env.ANALYSIS_PREVIEW_PATH?.replace('.html', '-partial.html'));
  await upload('835');
  assert.match(document.querySelector('[aria-label="837 claim results"]').textContent, /Claims accepted 2.*Claims rejected 1/,
    'An independent 835 run preserves the 837 run results');
  hold = true;
  await uploadMany('837', ['batch-next-a.837', 'batch-next-b.837'].map(name => new File(['synthetic'], name)));
  assert.equal(document.querySelector('[aria-label="837 claim results"]'), null, 'New run clears old counts immediately');
  assert.equal(document.querySelector('.cu-analysis-rejections'), null, 'Old rejection reports are cleared with the run');
  assert.match(document.querySelector('[aria-label="835 claim results"]').textContent, /Claims accepted 4.*Claims rejected 0/);
  const nextFile = { ...partialFile, id: 'batch-next-a.837', filename: 'batch-next-a.837' };
  savedFiles.set(nextFile.id, nextFile);
  hold = true;
  await act(async () => deferred(json({ success: true, saved: true, file: summary(nextFile) })));
  assert.match(document.querySelector('[aria-label="837 claim results"]').textContent, /Claims accepted 2.*Claims rejected 1/,
    'Current run claim counts update while the next file is processing');
  assert.deepEqual([...document.querySelectorAll('.cu-analysis-rejection-list section > strong')].map(item => item.textContent), [nextFile.filename]);
  const finalFile = { ...file('837', [claim('NEW-RUN-CLAIM', '25.00', 1)]), id: 'batch-next-b.837', filename: 'batch-next-b.837' };
  savedFiles.set(finalFile.id, finalFile);
  await act(async () => deferred(json({ success: true, saved: true, file: summary(finalFile) })));
  assert.match(document.querySelector('[aria-label="837 claim results"]').textContent, /Claims accepted 3.*Claims rejected 1/);
  await act(async () => root.render(React.createElement(Analysis, { key: 'partial-reload' })));
  assert.equal(document.querySelector('.cu-analysis-claim-results'), null, 'Loading saved history must not show historical totals as a current upload run');
  assert.ok(findClaim('SYNTHETIC-1001'), 'Saved comparison claims remain available after reload');
  // A large saved history still makes exactly one initial request. Only the
  // requested rows arrive, and navigation/search/export stay server-driven.
  savedFiles.clear();
  const many = file('837', Array.from({ length: 31 }, (_, index) => claim(`PAGE-${String(index).padStart(2, '0')}`, String(index) + '.00', index + 1)));
  savedFiles.set(many.id, many);
  const pageStart = calls.length;
  await act(async () => root.render(React.createElement(Analysis, { key: 'paged' })));
  assert.equal(calls.length - pageStart, 1);
  assert.equal(document.querySelectorAll('[data-analysis-claim]').length, 10);
  assert.ok(document.body.textContent.includes('Page 1 of 4'));
  await click('Next');
  assert.ok(calls.at(-1).url.includes('page=2'));
  assert.equal(displayedClaim(document.querySelector('[data-analysis-claim]')), 'PAGE-10');
  const beforeBatch = calls.length;
  await upload('837', 'batch-page-preserved.837');
  assert.equal(calls.slice(beforeBatch).filter(call => call.url.includes('view=comparison')).length, 1,
    'Upload completion refreshes only one comparison page');
  assert.ok(document.body.textContent.includes('Page 2 of 4'), 'Upload refresh preserves the selected page');
  const searchFor = async text => {
    await act(async () => {
      const input = document.querySelector('input[type="search"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Search');
  };
  holdComparison = true;
  await searchFor('PAGE-01');
  assert.equal(document.querySelectorAll('[data-analysis-claim]').length, 0, 'Search also hides rows from the previous query while loading');
  const oldRequest = calls.at(-1);
  await searchFor('PAGE-30');
  assert.equal(oldRequest.signal.aborted, true, 'Replacing a query cancels the previous request');
  assert.equal(displayedClaim(document.querySelector('[data-analysis-claim]')), 'PAGE-30');
  await act(async () => deferredComparison(json({ success: true, rows: [], total: 0, page: 1, pages: 1,
    counts: { both: 0, matched: 0, '837-only': 0 }, file_counts: { '837': 0, '835': 0 }, category: '837-only' })));
  assert.equal(displayedClaim(document.querySelector('[data-analysis-claim]')), 'PAGE-30', 'Stale responses cannot replace current results');
  await click('Download Excel');
  assert.ok(calls.at(-1).url.includes('view=excel'));
  assert.ok(calls.at(-1).url.includes('search=PAGE-30'));
  assert.ok(!calls.at(-1).url.includes('category='), 'Workbook includes all three categories');
  assert.ok(!calls.at(-1).url.includes('page='), 'Export includes every filtered result, not only the visible page');
  assert.equal(calls.filter(call => call.url.includes('view=rejections')).length, 1,
    'Rejection details load only for explicitly expanded reports');
  assert.equal(localStorage.length, 0, 'Uploaded data must not enter browser storage');
  savedFiles.clear();
  savedFiles.set(submission.id, { ...submission, claims: [submission.claims[1]] });
  savedFiles.set(remittance.id, { ...remittance, claims: [remittance.claims[1]] });
  await act(async () => root.render(React.createElement(Analysis, { key: 'excel-empty-category' })));
  await click('Mismatch amount');
  assert.equal(document.querySelectorAll('[data-analysis-claim]').length, 0);
  assert.equal(button('Download Excel').disabled, false, 'Other categories remain exportable when the selected tab is empty');
  await click('Download Excel');
  assert.equal(downloads.at(-1), 'Claims-Reconciliation.xlsx');
  console.log('Analysis uploads, signed comparisons, duplicate grouping, CSV, filters, validation errors, independent batch queues, live counts, failure-only retry, accumulation and reload persistence passed.');
} finally {
  await act(async () => root.unmount()); await server.close();
  globalThis.fetch = originalFetch; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl;
  window.HTMLAnchorElement.prototype.click = anchorClick; dom.window.close();
}
