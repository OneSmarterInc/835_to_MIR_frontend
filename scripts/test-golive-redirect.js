import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/onesmarter_admin/App.jsx', import.meta.url), 'utf8');
const goLive = fs.readFileSync(new URL('../src/onesmarter_admin/components/GoLiveView.jsx', import.meta.url), 'utf8');

assert.match(app, /onGoLiveCompleted=\{handleGoLiveCompleted\}/, 'App must handle final Go Live completion');
assert.match(app, /handleGoLiveCompleted[\s\S]*setActiveNav\('onboard'\)/, 'completion must return to Onboarding');
assert.match(goLive, /areAllGoLiveStepsDone[\s\S]*steps\.length === 6[\s\S]*every\(\(step\) => step\.done\)/, 'completion must require all six steps');
assert.match(goLive, /const wasComplete = areAllGoLiveStepsDone\(goliveState\?\.steps\)/, 'completion must record the prior state');
assert.match(goLive, /!wasComplete && isNowComplete && onGoLiveCompleted/, 'redirect must only fire on the first transition to complete');

console.log('Go Live completion redirect regression checks passed.');
