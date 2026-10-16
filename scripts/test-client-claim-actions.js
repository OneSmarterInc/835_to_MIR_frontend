import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

// Exercise the real portal, including opening a claim, dialogs, POST payloads,
// and refreshed history. All network responses use synthetic fixtures.
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) {
  globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
const { createRoot } = await import('react-dom/client');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const container = document.getElementById('root');
const root = createRoot(container);
const originalFetch = globalThis.fetch;
const fileId = '00000000-0000-4000-8000-000000000001';
let reason = '';
let records = [];
let posts = [];
let failNextPost = false;
const unexpected = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input, 'http://localhost');
  assert.equal(options.credentials, 'include');
  const response = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  if (url.pathname.endsWith('/overview/')) {
    return response({ success: true, client: 'Test client', metrics: {}, claims: [], history: [] });
  }
  if (url.pathname.endsWith('/comparison/')) {
    return response({ success: true, page: 1, pages: 1, count: 1, summary: {}, rows: [{
      key: 'TEST', claim: 'TEST', record_id: 42, file_id: fileId, paid_835: '0.00',
      issue_label: 'MIR record missing', issue_tone: 'error',
    }] });
  }
  if (url.pathname.endsWith('/claim/42/')) {
    return response({ success: true, claim: {
      id: 42, file_id: fileId, number: 'TEST', file_name: 'test.835', reason,
      billed: '1521.00', paid: '0.00', allowed: '0.00', payer_status: 'No payment',
      payer: 'EXAMPLE HEALTH & WELFARE', patient_name: 'Synthetic Patient',
      received_at: '2026-10-01T11:33:00Z', check_date: '20260806', patient_owes: '0.00', days: 2,
      services: [
        { code: '09408', billed: '587.00', allowed: '0.00', paid: '0.00', units: 1, date: '20251110',
          adjustments: [{ group: 'CO', code: '45', amount: '587.00' }] },
        { code: '09495', billed: '549.00', allowed: null, paid: '0.00', units: 0, date: '20260230', adjustments: [] },
        { code: '09446', billed: '385.00', allowed: '0.00', paid: '0.00', units: null, date: null, adjustments: [] },
      ], adjustments: [], timeline: [],
    } });
  }
  if (url.pathname.endsWith('/actions/')) {
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body);
      posts.push(payload);
      if (failNextPost) {
        failNextPost = false;
        return response({ success: false, error: 'Unable to save; try again.' }, 503);
      }
      records.unshift({ ...payload, id: records.length + 1, record_id: payload.claim_id,
        label: payload.kind === 'NOTE' ? 'Note added' : 'Review requested',
        by: 'Test user', status: 'OPEN', at: '2026-10-15T12:00:00Z',
      });
      return response({ success: true, message: 'Saved for review.' }, 201);
    }
    return response({ success: true, actions: records, page: 1, pages: 1, count: records.length });
  }
  unexpected.push(url.pathname);
  throw new Error('Unexpected request: ' + url.pathname);
};

const button = (text, scope = container) => {
  const found = [...scope.querySelectorAll('button')].find(item => item.textContent === text);
  assert.ok(found, 'Missing button: ' + text);
  return found;
};
const click = async element => { await act(async () => { element.click(); }); };
const fillNote = async text => {
  const textarea = container.querySelector('[role="dialog"] textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, text);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
};

try {
  const { default: Portal } = await server.ssrLoadModule('/src/pages/ClientUserPortal.jsx');
  const openClaim = async holdReason => {
    reason = holdReason;
    records = [];
    posts = [];
    await act(async () => {
      root.render(React.createElement(Portal, { key: holdReason, user: { name: 'Test user' } }));
    });
    await click(container.querySelector('.cu-comparison-table .cu-link'));
    const toolbar = container.querySelector('[aria-label="Claim actions"]');
    assert.ok(toolbar);
    assert.ok(toolbar.compareDocumentPosition(container.querySelector('.cu-timeline')) &
      window.Node.DOCUMENT_POSITION_FOLLOWING, 'Actions must precede the timeline and service lines');
    assert.equal(button('Request resend', toolbar).disabled, false);
    assert.equal(button('Add a note', toolbar).disabled, false);
    assert.ok(container.querySelector('[aria-label="Existing claim notes"]'));
  };

  await openClaim('');
  const serviceRows = container.querySelectorAll('.cu-service-table tbody tr');
  assert.equal(serviceRows.length, 3);
  assert.equal(serviceRows[0].cells[5].textContent, 'Nov 10, 2025');
  assert.equal(serviceRows[1].cells[5].textContent, '20260230', 'Invalid dates must not silently roll into another month');
  assert.equal(serviceRows[2].cells[5].textContent, '—');
  assert.equal(serviceRows[1].cells[4].textContent, '0', 'Zero units must remain visible');
  assert.equal(serviceRows[2].cells[4].textContent, '—');
  assert.equal(serviceRows[1].cells[2].textContent, '—', 'Missing amounts must not become zero');
  assert.ok(container.querySelector('.cu-timeline').textContent.includes('Aug 6, 2026'));
  const adjustment = serviceRows[0].querySelector('details');
  assert.ok(adjustment.querySelector('summary').textContent.includes('CO-45'));
  assert.ok(adjustment.querySelector('summary').textContent.includes('$587.00'));
  assert.ok(adjustment.querySelector('p').textContent.includes('Charge exceeds'));
  assert.ok(container.querySelector('.cu-payment-explanation p').textContent.includes('$1,521.00'));
  assert.ok(!container.textContent.includes('Request correction / release'));
  await click(button('Add a note'));
  assert.equal(button('Save decision').disabled, true);
  await fillNote('Please review this unpaid claim.');
  await act(async () => {
    const backdrop = container.querySelector('.cu-backdrop');
    backdrop.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    backdrop.click();
  });
  assert.ok(container.querySelector('[role="dialog"]'), 'Outside clicks must not discard a claim note');
  assert.equal(container.querySelector('textarea').value, 'Please review this unpaid claim.');
  assert.equal(button('Save decision').disabled, false);
  failNextPost = true;
  await click(button('Save decision'));
  assert.ok(container.textContent.includes('Unable to save; try again.'));
  assert.equal(container.querySelector('textarea').value, 'Please review this unpaid claim.');
  await click(button('Save decision'));
  assert.equal(container.querySelector('[role="dialog"]'), null);
  assert.deepEqual(posts.at(-1), { kind: 'NOTE', file_id: fileId, claim_id: 42,
    message: 'Please review this unpaid claim.' });
  assert.ok(container.querySelector('[aria-label="Existing claim notes"]').textContent
    .includes('Please review this unpaid claim.'));
  await click(button('Request resend'));
  assert.ok(container.querySelector('[role="dialog"]').textContent.includes('Client Admin'));
  await click(button('Save decision'));
  assert.deepEqual(posts.at(-1), { kind: 'REQUEST_RESEND', file_id: fileId, claim_id: 42, message: '' });
  assert.ok(container.querySelector('[aria-label="Existing claim notes"]').textContent.includes('Review requested'));

  for (const [holdReason, kind] of [
    ['Unknown code dictionary entry', 'REQUEST_DICTIONARY'],
    ['Missing plan ID', 'REQUEST_PLAN_ID'],
    ['Claim held for review', 'REQUEST_RELEASE'],
  ]) {
    await openClaim(holdReason);
    await click(button('Request correction / release'));
    await click(button('Save decision'));
    assert.deepEqual(posts.at(-1), { kind, file_id: fileId, claim_id: 42, message: '' });
  }
  assert.deepEqual(unexpected, []);
  console.log('Claim actions: unheld/held visibility, notes, resend, correction routing, retry and history passed.');
} finally {
  await act(async () => root.unmount());
  await server.close();
  globalThis.fetch = originalFetch;
  dom.window.close();
}
