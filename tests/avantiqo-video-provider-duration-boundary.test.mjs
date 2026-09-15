import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('owned video provider advertises the same 30 second bound as the Modal worker', () => {
  const registration=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js','utf8');
  const worker=fs.readFileSync('services/avantiqo-video-engine/modal_investor_t2v.py','utf8');
  assert.match(registration,/allowed_duration_seconds:\s*\[1, 30\]/);
  assert.match(worker,/MAX_SHOT_DURATION_SECONDS = 30/);
});
