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
const originalFetch = globalThis.fetch;
const paths = [];
let holdClaim = false, resolveClaim;
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url) => {
  paths.push(String(url));
  if (url.includes('/analysis/')) {
    const row = { key: 'TEST/CLAIM', claim: 'TEST/CLAIM', internal_number: 'REF', category: '837-only',
      billed_status: 'Awaiting 835 upload', allowed_status: 'Awaiting 835 upload', difference: null, allowed_difference: null,
      occurrences: [{ key: '1', source_type: '837', filename: 'synthetic', received_at: '2026-10-17T00:00:00Z', internal_number: 'REF', billed_837: '100.00' }] };
    if (url.includes('view=claim')) return json(new URL(url, 'http://localhost').searchParams.get('claim') === row.claim
      ? { success: true, row } : { success: false, error: 'This claim is not available in your Analysis files.' });
    return json({ success: true, rows: [row], total: 1, page: 1, pages: 1, category: '837-only',
      counts: { both: 0, matched: 0, '837-only': 1 }, file_counts: { '837': 1, '835': 0 } });
  }
  if (url.includes('/claim/42/')) {
    const response = json({ success: true, claim: { id: 42, number: 'TEST', file_id: 'file', billed: '100', paid: '80', services: [], sources: [] } });
    if (holdClaim) { holdClaim = false; return new Promise(resolve => { resolveClaim = () => resolve(response); }); }
    return response;
  }
  if (url.includes('/webauthn/credentials/')) return json([]);
  if (url.includes('/comparison-835-837/')) return json({ success: true, rows: [], count: 0, page: 1, pages: 1 });
  if (url.includes('/comparison/')) return json({ success: true, rows: [], count: 0, page: 1, pages: 1 });
  if (url.includes('/overview/')) return json({ success: true, metrics: {}, claims: [], history: [] });
  if (url.includes('/actions/')) return json({ success: true, actions: [] });
  if (url.includes('/history/') || url.includes('/tracked-files/')) return json({ success: true, files: [] });
  throw new Error('Unexpected request: ' + url);
};
const click = async text => {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent === text);
  assert.ok(button, 'Missing button ' + text);
  if (button.closest('#client-navigation')?.getAttribute('aria-hidden') === 'true') {
    await act(async () => document.querySelector('.cu-header-menu').click());
  }
  await act(async () => button.click());
};
let mount = 0;
try {
  const { default: Portal } = await server.ssrLoadModule('/src/pages/ClientUserPortal.jsx');
  const { readClientRoute, clientPagePath } = await server.ssrLoadModule('/src/utils/clientPortalRoute.ts');
  const reload = async () => {
    await act(async () => root.render(React.createElement(Portal, { key: ++mount, user: { name: 'Test user' } })));
    assert.equal(document.querySelector('[aria-label="Page navigation"]'), null);
    assert.ok(![...document.querySelectorAll('button, a')].some(item => /^(Conversions|Convert a file)$/.test(item.textContent)));
    if (['/', '/analysis', '/835-837-status'].includes(window.location.pathname)) {
      assert.equal(document.querySelector('[aria-label="Page navigation"]'), null, 'Header shortcuts are absent on every main page');
      const buttons = [...document.querySelectorAll('#client-navigation button')];
      assert.deepEqual(buttons.slice(0, 3).map(button => button.textContent), ['Home', '835/837 status', 'Analysis']);
      assert.equal(buttons.filter(button => button.getAttribute('aria-current') === 'page').length, 1);
      if (process.env.CLIENT_PORTAL_PREVIEW_PATH) {
        const fs = await import('node:fs/promises');
        const styles = await Promise.all(['src/index.css', 'src/pages/ClientUserPortal.css', 'src/pages/ClientClaimDetail.css', 'src/components/ClientClaimComparison.css', 'src/components/ClientAnalysis.css', 'src/components/Client835837Status.css'].map(path => fs.readFile(path, 'utf8')));
        const output = process.env.CLIENT_PORTAL_PREVIEW_PATH.replace('.html', `-${window.location.pathname.slice(1) || 'home'}.html`);
        await fs.writeFile(output, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Client portal preview</title><style>${styles.join('\n')}</style></head><body>${document.getElementById('root').innerHTML}</body></html>`);
      }
    }
  };
  const visit = async path => { window.history.replaceState(null, '', path); await reload(); };
  const moveHistory = async direction => act(async () => {
    const changed = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
    window.history[direction](); await changed;
  });
  await visit('/');
  assert.equal(document.querySelector('.cu-page-navigation'), null);
  assert.ok([...document.querySelectorAll('#client-navigation button')].some(button => button.textContent === '835/837 status'));
  const menu = () => document.querySelector('.cu-header-menu');
  const nav = () => document.querySelector('#client-navigation');
  const pointer = async (element, type, relatedTarget = null, pointerType = 'mouse') => act(async () => {
    const event = new window.MouseEvent(type, { bubbles: true, relatedTarget });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    element.dispatchEvent(event);
  });
  const settleHover = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
  assert.equal(menu().getAttribute('aria-expanded'), 'false');
  await pointer(menu(), 'pointerover');
  assert.equal(menu().getAttribute('aria-expanded'), 'true');
  assert.equal(menu().getAttribute('aria-pressed'), 'false');
  await pointer(menu(), 'pointerout');
  await pointer(nav(), 'pointerover');
  await settleHover();
  assert.equal(nav().getAttribute('aria-hidden'), 'false', 'Crossing from icon into panel must keep it open');
  await pointer(nav(), 'pointerout');
  await settleHover();
  assert.equal(menu().getAttribute('aria-expanded'), 'false');
  await pointer(menu(), 'pointerover');
  await act(async () => menu().click());
  await pointer(menu(), 'pointerout');
  await settleHover();
  assert.equal(menu().getAttribute('aria-pressed'), 'true');
  assert.equal(nav().getAttribute('aria-hidden'), 'false', 'Clicked menu stays pinned when the pointer leaves');
  if (process.env.CLIENT_PORTAL_PREVIEW_PATH) {
    const fs = await import('node:fs/promises');
    const styles = await Promise.all(['src/index.css', 'src/pages/ClientUserPortal.css', 'src/pages/ClientClaimDetail.css', 'src/components/ClientClaimComparison.css'].map(path => fs.readFile(path, 'utf8')));
    await fs.writeFile(process.env.CLIENT_PORTAL_PREVIEW_PATH, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Client portal preview</title><style>${styles.join('\n')}</style></head><body>${document.getElementById('root').innerHTML}</body></html>`);
  }
  await click('835/837 status');
  assert.equal(nav().getAttribute('aria-hidden'), 'false', 'Pinned menu stays open across navigation');
  await act(async () => menu().click());
  assert.equal(menu().getAttribute('aria-expanded'), 'false', 'Second click closes and unpins');
  await pointer(menu(), 'pointerover', null, 'touch');
  assert.equal(menu().getAttribute('aria-expanded'), 'false', 'Touch does not trigger hover');
  await act(async () => menu().click());
  await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
  assert.equal(menu().getAttribute('aria-expanded'), 'false');
  assert.equal(window.location.pathname, '/835-837-status');
  assert.equal(document.querySelector('h1').textContent, '835/837 status');
  await reload();
  assert.equal(document.querySelector('h1').textContent, '835/837 status', 'Status survives reload');
  await click('Analysis');
  assert.equal(window.location.pathname, '/analysis');
  const beforeReload = paths.length;
  await reload();
  assert.equal(document.querySelector('h1').textContent, 'Analysis');
  assert.equal(paths.slice(beforeReload).length, 1, 'Refreshing Analysis uses one paged comparison request');
  assert.ok(paths.at(-1).startsWith('/edi835/api/client-portal/analysis/?view=comparison'));
  await moveHistory('back');
  assert.equal(window.location.pathname, '/835-837-status');
  assert.equal(document.querySelector('h1').textContent, '835/837 status');
  await moveHistory('forward');
  assert.equal(document.querySelector('h1').textContent, 'Analysis');
  await act(async () => document.querySelector('[data-analysis-claim]').click());
  assert.equal(window.location.pathname, '/analysis/claims/TEST%2FCLAIM');
  await reload();
  assert.ok(document.querySelector('[aria-label="Analysis claim detail"]'), 'Analysis claim reloads from saved source data');
  await click('← Back to Analysis');
  assert.equal(window.location.pathname, '/analysis');
  await click('History');
  assert.equal(window.location.pathname, '/history');
  await click('Review activity');
  assert.equal(window.location.pathname, '/history/activity');
  await reload();
  assert.equal(document.querySelector('#history-tab-activity').getAttribute('aria-selected'), 'true');
  await click('Settings');
  assert.equal(window.location.pathname, '/settings');
  await reload();
  assert.equal(document.querySelector('h1').textContent, 'Account settings');
  await click('← Back to Home');
  await click('835/837 status');
  assert.equal(window.location.pathname, '/835-837-status');
  await reload();
  assert.equal(document.querySelector('h1').textContent, '835/837 status');
  await visit('/claims/42');
  assert.ok(document.querySelector('[aria-label="Claim actions"]'));
  await reload();
  assert.ok(document.querySelector('[aria-label="Claim actions"]'), 'Claim reloads using its record ID');
  holdClaim = true;
  await visit('/claims/42');
  await click('← Back to Home');
  await act(async () => resolveClaim());
  assert.equal(window.location.pathname, '/');
  assert.equal(document.querySelector('h1').textContent, 'Claims overview', 'Late claim fetch must not reopen a claim');
  await visit('/analysis/claims/NOT-AVAILABLE');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('not available'));
  await click('← Back to Analysis');
  assert.equal(window.location.pathname, '/analysis');
  for (const removed of ['/conversions', '/conversions/', '/conversions?run=old']) {
    const before = paths.length;
    await visit(removed);
    assert.equal(window.location.pathname, '/');
    assert.equal(document.querySelector('h1').textContent, 'Claims overview');
    assert.ok(!paths.slice(before).some(path => path.includes('/tracked-files/')));
    await reload();
    assert.equal(window.location.pathname, '/');
  }
  assert.equal(readClientRoute('/conversions').tab, 'home');
  assert.equal(readClientRoute('/analysis/').tab, 'analysis');
  assert.equal(readClientRoute('/claims/%broken').tab, 'home');
  assert.equal(clientPagePath('analysis', 'A/B?#'), '/analysis/claims/A%2FB%3F%23');
  console.log('Client routes, reloads, Back/Forward, history sections, claim deep links, stale requests and hover/pinned navigation passed.');
} finally {
  await act(async () => root.unmount()); await server.close();
  globalThis.fetch = originalFetch; dom.window.close();
}
