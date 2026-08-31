import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/onesmarter_admin/App.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/onesmarter_admin/components/SftpAutomationView.jsx', import.meta.url), 'utf8');

assert.match(app, /SFTP Automation/, 'admin navigation must expose SFTP Automation');
assert.match(app, /<SftpAutomationView/, 'admin navigation must render the automation page');
assert.match(page, /api\/admin\/sftp-automation\//, 'page must use the protected automation API');
assert.match(page, /type="time"/, 'page must accept a scheduled time');
assert.match(page, /scheduleTimeZoneOptions/, 'page must expose timezone selection');
assert.match(page, /All Client Schedules/, 'page must list every client schedule');
for (const label of ['835 Inputs', '837 / RECON Inputs', 'MIR Outputs', 'Status / Error']) {
  assert.match(page, new RegExp(label.replace('/', '\\/')), `run table missing ${label}`);
}

console.log('SFTP automation UI regression checks passed.');
