import assert from 'node:assert/strict';

import {
  formatDateTimeWithZones,
  shouldShowTimeZoneSelector,
} from '../src/utils/timezone.js';

const winter = '2026-01-15T15:00:00Z';
const summer = '2026-07-15T14:00:00Z';

const outsideUs = formatDateTimeWithZones(winter, {
  localTimeZone: 'Asia/Kolkata',
});
assert.match(outsideUs, /Eastern: .*10:00 AM EST/);
assert.match(outsideUs, /Local \(Asia\/Kolkata\): .*08:30 PM GMT\+5:30/);
assert.equal(shouldShowTimeZoneSelector('Asia/Kolkata'), true);

const insideUs = formatDateTimeWithZones(summer, {
  localTimeZone: 'America/New_York',
});
assert.match(insideUs, /^Eastern: .*10:00 AM EDT$/);
assert.doesNotMatch(insideUs, /Local/);
assert.equal(shouldShowTimeZoneSelector('America/New_York'), false);

console.log('Timezone formatting regression checks passed.');
