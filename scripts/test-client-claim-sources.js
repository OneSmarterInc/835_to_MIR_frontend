import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const originalFetch = globalThis.fetch;
const originalCreateUrl = URL.createObjectURL;
const originalRevokeUrl = URL.revokeObjectURL;
const originalClick = window.HTMLAnchorElement.prototype.click;
let blob;
const downloads = [], requests = [], pending = [];
URL.createObjectURL = value => { blob = value; return 'blob:claim'; };
URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
globalThis.fetch = (url, options) => {
  assert.equal(options.credentials, 'include');
  requests.push({ url, options });
  return new Promise(resolve => pending.push(resolve));
};
const record = (id, filename) => ({ record_id: id, filename, sequence: id,
  file_id: `file-${id}`, received_at: '2026-10-15T12:00:00Z' });
const sources = [
  { kind: '835', linked: true, records: [record(1, 'held.835')] },
  { kind: 'mir', linked: true, records: [record(2, 'generated.mir')] },
  { kind: '837', linked: false, records: [record(3, 'first.837'), record(4, 'second.837')] },
  { kind: 'recon', linked: false, records: [record(5, 'paid.csv')] },
];
const button = text => {
  const result = [...document.querySelectorAll('button')].find(node => node.textContent === text);
  assert.ok(result, `Missing ${text}`);
  return result;
};
const click = async text => act(async () => button(text).click());
const select = async id => act(async () => {
  const input = document.querySelector('select');
  input.value = String(id); input.dispatchEvent(new window.Event('change', { bubbles: true }));
});
const respond = async (content, kind, status = 200) => act(async () => {
  pending.shift()(new Response(JSON.stringify(status === 200 ? {
    success: true, content, download_name: `123456789.${kind}`, source: { filename: `selected.${kind}` },
  } : { success: false, error: 'Source is incomplete.' }), { status, headers: { 'Content-Type': 'application/json' } }));
});

try {
  const { default: Viewer } = await server.ssrLoadModule('/src/components/ClientClaimSources.tsx');
  await act(async () => root.render(React.createElement(Viewer, { claimId: 42, sources })));
  assert.deepEqual([...document.querySelectorAll('.cu-source-buttons button')].map(b => b.textContent), ['835', 'MIR', '837', 'Recon']);
  assert.equal(document.querySelector('pre'), null);
  await click('835');
  assert.equal(button('Download .835').disabled, true);
  assert.ok(document.querySelector('[role="status"]'));
  await respond('', '835', 422);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('incomplete'));
  await click('Try again');
  const content = 'ST*835*0001~\nCLP*123456789*1*10*8~\nSE*3*0001~\n';
  await respond(content, '835');
  if (process.env.CLAIM_PREVIEW_PATH) {
    const fs = await import('node:fs/promises');
    const styles = await Promise.all(['src/index.css', 'src/pages/ClientUserPortal.css', 'src/pages/ClientClaimDetail.css'].map(path => fs.readFile(path, 'utf8')));
    await fs.writeFile(process.env.CLAIM_PREVIEW_PATH, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Claim source preview</title><style>${styles.join('\n')}</style></head><body><main class="cu-main cu-claim-page">${document.getElementById('root').innerHTML}</main></body></html>`);
  }
  assert.ok(document.querySelector('.cu-source-viewer-heading').contains(button('Download .835')));
  await click('Download .835');
  assert.equal(await blob.text(), content, 'Download retains raw identifiers and exact slice');
  assert.equal(downloads.at(-1), '123456789.835');

  await click('837');
  assert.equal(document.querySelector('pre'), null, 'Previous source must disappear immediately');
  assert.equal(document.querySelector('select').value, '3');
  assert.equal(requests.length, 3, 'The first listed 837 file loads automatically');
  const clearedRequest = requests.at(-1);
  await select('');
  assert.equal(clearedRequest.options.signal.aborted, true);
  assert.equal(document.querySelector('[role="status"]'), null, 'Clearing a file stops the loading state');
  await respond('CLEARED FILE', '837');
  assert.equal(document.querySelector('pre'), null);
  await select(3);
  const oldRequest = requests.at(-1);
  await select(4);
  assert.equal(oldRequest.options.signal.aborted, true);
  await respond('STALE FILE', '837');
  assert.equal(document.querySelector('pre'), null, 'Ignore a late response from the previous file');
  await respond('ST*837*2~\nCLM*123456789*20~\nSE*3*2~\n', '837');
  assert.ok(requests.at(-1).url.endsWith('source/837/?record_id=4'));
  await click('Download .837');
  assert.equal(downloads.at(-1), '123456789.837');

  await click('MIR');
  await respond('01FIXED WIDTH       \r\n', 'mir');
  await click('Download .mir');
  assert.equal(await blob.text(), '01FIXED WIDTH       \r\n');
  assert.equal(downloads.at(-1), '123456789.mir');

  await click('Recon');
  assert.equal(document.querySelector('select').value, '5', 'The single Recon file is selected by default');
  assert.ok(requests.at(-1).url.endsWith('source/recon/?record_id=5'));
  await respond('claim_number,paid_amount\r\n123456789,8\r\n', 'recon');
  await click('Download .recon');
  assert.equal(downloads.at(-1), '123456789.recon');
  await click('Recon');
  assert.equal(document.querySelector('#claim-source-viewer'), null, 'Active format button toggles viewer closed');

  await act(async () => root.render(React.createElement(Viewer, { key: 99, claimId: 99, sources: [sources[0]] })));
  assert.deepEqual([...document.querySelectorAll('button')].map(b => b.textContent), ['835']);
  await act(async () => root.render(React.createElement(Viewer, { key: 100, claimId: 100, sources: [] })));
  assert.equal(document.querySelector('section'), null);
  console.log('Claim source buttons, default file selection, switching, stale responses, retries and exact downloads passed.');
} finally {
  await act(async () => root.unmount());
  await server.close();
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateUrl;
  URL.revokeObjectURL = originalRevokeUrl;
  window.HTMLAnchorElement.prototype.click = originalClick;
  dom.window.close();
}
