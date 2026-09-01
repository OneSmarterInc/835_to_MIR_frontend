import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  canonicalTimeZone,
  formatDateTimeWithZones,
  scheduleTimeLabel,
  shouldShowTimeZoneSelector,
} from '../src/utils/timezone.js';

assert.equal(canonicalTimeZone('Asia/Calcutta'), 'Asia/Kolkata');
assert.match(scheduleTimeLabel('13:29', 'Asia/Calcutta'), /13:29.*India Standard Time.*Asia\/Kolkata/);

const winter = '2026-01-15T15:00:00Z';
const summer = '2026-07-15T14:00:00Z';

const outsideUs = formatDateTimeWithZones(winter, {
  localTimeZone: 'Asia/Kolkata',
});
assert.match(outsideUs, /US Eastern \(America\/New_York\): .*10:00 AM EST/);
assert.match(outsideUs, /Local \(Asia\/Kolkata\): .*08:30 PM GMT\+5:30/);
assert.equal(shouldShowTimeZoneSelector('Asia/Kolkata'), true);

const insideUs = formatDateTimeWithZones(summer, {
  localTimeZone: 'America/New_York',
});
assert.match(insideUs, /^US Eastern \(America\/New_York\): .*10:00 AM EDT$/);
assert.doesNotMatch(insideUs, /Local/);
assert.equal(shouldShowTimeZoneSelector('America/New_York'), false);

for (const component of [
  'src/onesmarter_admin/components/StepRung.jsx',
  'src/onesmarter_admin/components/GoLiveView.jsx',
]) {
  const source = readFileSync(component, 'utf8');
  assert.match(source, /<label[^>]*>Timezone:<\/label>/);
  assert.doesNotMatch(source, /shouldShowTimeZoneSelector\(\)/);
}

const timeDisplay = readFileSync('src/components/TimeDisplay.jsx', 'utf8');
assert.match(timeDisplay, /parts\.eastern\.label/);
assert.match(timeDisplay, /parts\.local\.label/);
assert.match(timeDisplay, /display: 'inline-grid'/);

console.log('Timezone formatting regression checks passed.');
