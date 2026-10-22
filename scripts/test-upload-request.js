import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadRequest } from '../src/utils/uploadRequest.js';

let last;
class Upload {
  upload = {}; headers = {}; sends = 0;
  constructor() { last = this; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  send(body) { this.body = body; this.sends++; }
  getResponseHeader() { return 'application/json'; }
  abort() { this.onabort(); }
}
globalThis.XMLHttpRequest = Upload;

test('upload bytes and server processing are separate; multipart boundary is browser-owned', async () => {
  const stages = [];
  const body = new FormData(); body.append('file', new Blob(['synthetic']), 'extensionless');
  const pending = uploadRequest('/edi835/api/client-portal/analysis/?compact=1', {
    body, csrfToken: 'synthetic-csrf', onProgress: state => stages.push(state),
  });
  assert.equal(last.withCredentials, true);
  assert.equal(last.headers['X-CSRFToken'], 'synthetic-csrf');
  assert.equal(last.headers['Content-Type'], undefined);
  last.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  last.upload.onload();
  assert.deepEqual(stages, [{ stage: 'uploading', percent: 0 }, { stage: 'uploading', percent: 50 },
    { stage: 'processing', percent: 100 }]);
  last.status = 409;
  last.responseText = JSON.stringify({ duplicate: true, receipts: [{ receipt_id: 'receipt' }] });
  last.onload();
  const response = await pending;
  assert.equal(response.status, 409);
  assert.equal((await response.json()).receipts[0].receipt_id, 'receipt');
  assert.equal(last.sends, 1);
});

test('abort cancels in-flight upload and does not retry the mutation', async () => {
  const controller = new AbortController();
  const pending = uploadRequest('/api/validate/', { body: '{}', csrfToken: 'synthetic', signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(last.sends, 1);
});

test('timeouts report uncertain processing instead of claiming nothing was saved', async () => {
  const pending = uploadRequest('/api/validate/', { body: '{}', csrfToken: 'synthetic' });
  last.ontimeout();
  await assert.rejects(pending, /not been confirmed/);
  assert.equal(last.sends, 1);
});

test('secure token bootstrap failure never transmits a file', async () => {
  const original = globalThis.fetch;
  const previous = last;
  globalThis.fetch = async () => new Response('{}', { status: 403 });
  try {
    await assert.rejects(uploadRequest('/api/validate/', { body: '{}' }), /secure upload/);
    assert.equal(last, previous);
  } finally { globalThis.fetch = original; }
});
