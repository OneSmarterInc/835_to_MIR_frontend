import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root">Original text</div>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { initializeDemoMode, isDemoModeEnabled, startDemoSubstitution } =
    await server.ssrLoadModule('/src/utils/demoSubstitution.js');
  const { encodeDemoValue, encodeDemoData, encodeDemoFileContent, getDemoRevealValue } =
    await server.ssrLoadModule('/src/utils/demoEncoder.js');
  const { default: Header } = await server.ssrLoadModule('/src/onesmarter_admin/components/Header.jsx');
  const data = { claim_number: 'SYNTHETIC-12345', patient_name: 'Example Patient', amount: 42 };
  const file = 'ISA*EXAMPLE~CLP*SYNTHETIC-12345*1*60*30~';

  // Existing users must also leave the earlier forced-on state after startup.
  for (const previous of [null, 'true', 'false']) {
    localStorage.clear();
    if (previous !== null) localStorage.setItem('mir-demo-substitution', previous);
    initializeDemoMode();
    assert.equal(isDemoModeEnabled(), false);
    assert.equal(localStorage.getItem('mir-demo-substitution'), 'false');
    assert.equal(encodeDemoValue(data.claim_number), data.claim_number);
    assert.equal(encodeDemoValue(data.claim_number, false), data.claim_number);
    assert.equal(encodeDemoValue(12345), 12345);
    assert.equal(encodeDemoData(data), data);
    assert.equal(encodeDemoFileContent(file, '835'), file);
    assert.equal(getDemoRevealValue('***1234'), null);
    const stop = startDemoSubstitution();
    assert.equal(document.getElementById('root').textContent, 'Original text');
    stop();

    const header = document.createElement('div');
    header.innerHTML = renderToStaticMarkup(React.createElement(Header, {
      currentUser: { name: 'Example User', role: 'Super Admin' },
    }));
    const toggle = header.querySelector('.admin-demo-toggle input');
    assert.equal(toggle.checked, false);
    assert.equal(toggle.disabled, true);
    assert.equal(toggle.closest('label').hidden, true);
  }

  // Preserve the opt-in encoding implementation for future use.
  localStorage.setItem('mir-demo-substitution', 'true');
  assert.notEqual(encodeDemoValue(data.claim_number), data.claim_number);
  assert.notEqual(encodeDemoData(data).patient_name, data.patient_name);
  initializeDemoMode();
  assert.equal(encodeDemoValue(data.claim_number), data.claim_number);
  console.log('PASS: demo mode starts disabled, saved opt-ins are cleared, hidden toggle is unchecked, and values/files remain original.');
} finally {
  await server.close();
  dom.window.close();
}
