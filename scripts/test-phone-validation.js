import assert from 'node:assert/strict';
import { splitE164, toE164, validateNationalNumber } from '../src/utils/phone.js';

const validNumbers = [
  ['US', '4155552671', '+14155552671'],
  ['CA', '4165552671', '+14165552671'],
  ['IN', '9876543210', '+919876543210'],
  ['GB', '07400123456', '+447400123456'],
  ['AU', '0412345678', '+61412345678'],
  ['NZ', '0211234567', '+64211234567'],
  ['AE', '0501234567', '+971501234567'],
  ['SG', '81234567', '+6581234567'],
  ['DE', '015112345678', '+4915112345678'],
  ['FR', '0612345678', '+33612345678'],
];

for (const [country, national, expected] of validNumbers) {
  assert.equal(validateNationalNumber(country, national), '', `${country} valid number rejected`);
  assert.equal(toE164(country, national), expected, `${country} E.164 conversion failed`);
}

for (const [country, national] of [['US', '1723979234'], ['IN', '1234567890'], ['GB', '02079460000'], ['SG', '61234567']]) {
  assert.ok(validateNationalNumber(country, national), `${country} invalid mobile accepted`);
}

assert.deepEqual(splitE164('+919876543210'), { countryIso: 'IN', nationalNumber: '9876543210' });
assert.equal(validateNationalNumber('US', '14155552671'), '');
assert.equal(toE164('US', '14155552671'), '+14155552671');
assert.equal(validateNationalNumber('IN', '919876543210'), '');
assert.equal(toE164('IN', '919876543210'), '+919876543210');
assert.match(validateNationalNumber('US', '4343'), /10 digits after \+1.*4 entered/);
console.log('Phone validation checks passed.');
