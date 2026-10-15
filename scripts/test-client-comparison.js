import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Comparison, ComparisonStatus } = await server.ssrLoadModule(
    '/src/components/ClientClaimComparison.jsx',
  );
  const renderStatus = (row, recon = false) => renderToStaticMarkup(
    React.createElement(ComparisonStatus, { row, recon }),
  );
  const table = renderToStaticMarkup(React.createElement(Comparison, {}));
  assert.ok(table.includes('835/MIR status'));
  assert.ok(!table.includes('Issue / reason'));
  assert.ok(table.includes('billed to billed and paid to paid'));
  assert.ok(table.includes('Recon separately compares MIR paid to Recon paid'));
  assert.equal((table.match(/aria-sort=/g) || []).length, 10);
  assert.ok(table.indexOf('835/MIR status') < table.indexOf('Payer status'));

  const row = {
    paid_835: '79.99', issue_label: 'Paid differs', issue_tone: 'error',
    issue_detail: 'Billed: 835 100.00 / MIR 100.00 | Paid: 835 79.99 / MIR 80.00',
    recon_issue_label: 'Paid matches', recon_issue_tone: 'clear',
    recon_issue_detail: 'MIR/Recon: paid amounts match | Paid: MIR 80.00 / Recon 80.00',
  };
  const mismatch = renderStatus(row);
  assert.ok(mismatch.includes('<details'));
  assert.ok(mismatch.includes('<summary'));
  assert.ok(mismatch.includes('cu-issue-error'));
  assert.ok(mismatch.includes('Paid differs'));
  assert.ok(mismatch.includes('79.99 / MIR 80.00'));
  assert.ok(!mismatch.includes('Paid matches'));
  const recon = renderStatus(row, true);
  assert.ok(recon.includes('cu-issue-clear'));
  assert.ok(recon.includes('Paid matches'));
  assert.ok(!recon.includes('79.99'));

  for (const label of ['Billed differs', 'Billed & paid differ', 'MIR record missing',
    '835 record missing', 'MIR amounts missing', 'Duplicate 835', 'Duplicate MIR']) {
    const html = renderStatus({ ...row, paid_835: null, issue_label: label });
    assert.ok(html.includes(label.replaceAll('&', '&amp;')));
    assert.ok(html.includes('cu-issue-error'));
    assert.ok(!html.includes('Status unavailable'));
  }
  const matching = renderStatus({ ...row, paid_835: '80.00',
    issue_label: 'Billed & paid match', issue_tone: 'clear',
    issue_detail: 'Billed: 835 100.00 / MIR 100.00 | Paid: 835 80.00 / MIR 80.00',
    recon_issue_label: 'Recon record missing', recon_issue_tone: 'error',
  });
  assert.ok(matching.includes('Billed &amp; paid match'));
  assert.ok(matching.includes('cu-issue-clear'));
  assert.ok(!matching.includes('Recon record missing'));

  // During separate rollouts the old API must not produce a false match.
  for (const reconMode of [false, true]) {
    const legacy = renderStatus({ issue_label: 'Amounts match', issue_tone: 'clear' }, reconMode);
    assert.ok(legacy.includes('Status unavailable'));
    assert.ok(!legacy.includes('Amounts match'));
    assert.ok(legacy.includes('cu-issue-neutral'));
  }
  const escaped = renderStatus({ ...row, issue_detail: '<script>alert(1)</script>' });
  assert.ok(!escaped.includes('<script>'));
  assert.ok(escaped.includes('&lt;script&gt;'));
  console.log('Client comparison rendering regressions passed.');
} finally {
  await server.close();
}
