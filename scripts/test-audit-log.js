import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/onesmarter_admin/App.jsx', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../src/onesmarter_admin/components/AuditLogView.jsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/onesmarter_admin/services/api.js', import.meta.url), 'utf8');

assert.doesNotMatch(app, /Recent Administrator Login History/);
assert.match(app, /<AuditLogView clients=\{clients\}/);
for (const filter of ['search', 'client_id', 'module', 'action', 'performed_by', 'date_from', 'date_to']) {
  assert.match(view, new RegExp(filter), `Audit Log must include ${filter} filtering`);
}
assert.match(view, /\[10, 25, 50, 100\]/, 'Audit Log must offer standard page sizes');
assert.match(view, /pagination\.total_count/, 'Audit Log must use server-side filtered totals');
assert.match(api, /Object\.entries\(filters\)/, 'Audit API client must send the complete filter set');

console.log('Audit Log UI regression checks passed.');
