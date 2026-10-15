import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Use the project's JSX compiler and React renderer; no source-text assertions.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Amounts } = await server.ssrLoadModule('/src/components/ClientFinancialAmounts.jsx');
  const metrics = {
    billed_835_amount: '125.50', billed_835_claims: 2,
    billed_mir_amount: '87.50', billed_mir_services: 3,
    recon_amount: '21.25', recon_claims: 1,
    // Legacy metrics must never substitute for any of the independent streams.
    billed_amount: '9999.00', paid_amount: '8888.00', patient_amount: '7777.00',
  };
  const render = props => renderToStaticMarkup(React.createElement(Amounts, props));
  const full = render({ metrics });
  for (const label of ['Billed in 835', 'Billed MIR', 'Amount in Recon']) assert.ok(full.includes(label));
  for (const value of ['$125.50', '$87.50', '$21.25']) assert.ok(full.includes(value));
  assert.ok(!full.includes('$9,999.00'));
  assert.ok(full.includes('835 received date'));
  assert.ok(full.includes('conversion date'));
  assert.ok(full.includes('Reported paid amount · Recon received date'));

  const noData = render({ metrics: {
    ...metrics, billed_mir_services: 0, billed_mir_amount: '0.00',
  } });
  assert.ok(noData.includes('No MIR services in this period'));
  assert.ok(noData.includes('$125.50') && noData.includes('$21.25'));
  assert.ok(!noData.includes('$0.00'));
  const zero = render({ metrics: { ...metrics, recon_amount: '0.00' } });
  assert.ok(zero.includes('$0.00'));
  assert.ok(!zero.includes('No Recon claims'));
  const negative = render({ metrics: { ...metrics, recon_amount: '-12.34' } });
  assert.ok(negative.includes('-$12.34'));
  const precise = render({ metrics: { ...metrics, billed_835_amount: '9999999999999999.99' } });
  assert.ok(precise.includes('$9,999,999,999,999,999.99'));

  for (const props of [{}, { metrics: {} }, { metrics: { paid_amount: '8888.00' } }]) {
    const unavailable = render(props);
    assert.equal((unavailable.match(/Amount unavailable/g) || []).length, 3);
    assert.ok(!unavailable.includes('$'));
  }
  for (const value of [null, undefined, '', 'NaN', 'Infinity', '<script>', 12.34]) {
    const invalid = render({ metrics: { ...metrics, recon_amount: value } });
    assert.ok(invalid.includes('Amount unavailable'));
    assert.ok(!invalid.includes('$21.25'));
  }
  const loading = render({ metrics, loading: true });
  assert.ok(loading.includes('aria-busy="true"'));
  assert.equal((loading.match(/Loading…/g) || []).length, 3);
  assert.ok(!loading.includes('$125.50'));
  const nextPeriod = render({ metrics: {
    billed_835_amount: '2.00', billed_835_claims: 1,
    billed_mir_amount: '3.00', billed_mir_services: 1,
    recon_amount: '4.00', recon_claims: 1,
  } });
  for (const value of ['$2.00', '$3.00', '$4.00']) assert.ok(nextPeriod.includes(value));
  for (const value of ['$125.50', '$87.50', '$21.25']) assert.ok(!nextPeriod.includes(value));
  console.log('Client financial amount rendering tests passed.');
} finally {
  await server.close();
}
