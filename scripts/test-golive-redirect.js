import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/onesmarter_admin/App.jsx', import.meta.url), 'utf8');
const goLive = fs.readFileSync(new URL('../src/onesmarter_admin/components/GoLiveView.jsx', import.meta.url), 'utf8');
const onboarding = fs.readFileSync(new URL('../src/onesmarter_admin/components/OnboardingLadder.jsx', import.meta.url), 'utf8');
const stepRung = fs.readFileSync(new URL('../src/onesmarter_admin/components/StepRung.jsx', import.meta.url), 'utf8');

assert.match(app, /onGoLiveCompleted=\{handleGoLiveCompleted\}/, 'App must handle final Go Live completion');
assert.match(app, /handleGoLiveCompleted[\s\S]*setActiveNav\('onboard'\)/, 'completion must return to Onboarding');
assert.match(app, /searchParams\.set\('step', '14'\)/, 'completion must focus Onboarding Step 14');
assert.match(app, /hash = 'step-14'/, 'completion URL must identify Step 14');
assert.match(onboarding, /data-display-step-number/, 'Onboarding must locate a step by its displayed number');
assert.match(stepRung, /data-display-step-number=\{displayStepNumber\}/, 'each rung must expose its displayed step number');
assert.match(goLive, /areAllGoLiveStepsDone[\s\S]*steps\.length === 6[\s\S]*every\(\(step\) => step\.done\)/, 'completion must require all six steps');
assert.match(goLive, /const wasComplete = areAllGoLiveStepsDone\(goliveState\?\.steps\)/, 'completion must record the prior state');
assert.match(goLive, /!wasComplete && isNowComplete && onGoLiveCompleted/, 'redirect must only fire on the first transition to complete');

console.log('Go Live completion redirect regression checks passed.');
