import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/pages/ResultView.jsx', import.meta.url), 'utf8');

assert.match(source, /const sortRef = useRef\(sort\)/, 'sorting must retain the latest direction synchronously');
assert.match(source, /sortRef\.current = next;[\s\S]*loadResults\(1, activeSearch, next, statusFilterRef\.current\)/, 'header clicks must immediately request page one with the next sort');
assert.match(source, /direction: current\.key === key && current\.direction === "asc" \? "desc" : "asc"/, 'repeat clicks must toggle ascending and descending');
assert.match(source, /\}, \[search, loadResults\]\);/, 'the search debounce must not own sort requests');
assert.match(source, /className="result-match-count"[\s\S]*data\.total_claims/, 'the result toolbar must show the full filtered result count');
assert.ok(source.indexOf('className="result-match-count"') < source.indexOf('className="result-global-search"'), 'the matching result count must appear before search');
assert.match(source, /hasMirAndRecon\(row\) \? money\(row\.difference_amount\) : "-"/, 'difference must be hidden when a claim exists in only MIR or RECON');
assert.match(source, /\/edi835\/api\/reconciliation\/export\/\?\$\{params\}/, 'Excel export must use the server-side filtered export endpoint');
assert.match(source, />\{exportBusy \? "Preparing…" : "Download XL"\}<\/button>/, 'the Result toolbar must expose the Download XL action');

for (const key of ['claim_id', 'patient_name', 'mir_filename', 'recon_filename', 'amount_to_pay', 'recon_paid_amount', 'difference_amount', 'status']) {
  assert.match(source, new RegExp(`sortKey="${key}"`), `missing sortable header: ${key}`);
}

console.log('Result sorting regression checks passed.');
