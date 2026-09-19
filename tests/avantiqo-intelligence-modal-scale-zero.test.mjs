import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all owned Intelligence Modal lanes are scale-to-zero with no minimum worker', () => {
  const gpu = source('services/avantiqo-intelligence-modal/modal_app.py');
  const front = source('services/avantiqo-intelligence-modal/modal_front_app.py');
  const provider = source('lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js');
  const registration = source('lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js');
  const direct = source('lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js');

  assert.doesNotMatch(gpu, /min_containers\s*=\s*[1-9]/);
  assert.doesNotMatch(front, /min_containers\s*=\s*[1-9]/);
  assert.match(front, /min_containers=0/);
  assert.match(provider, /front_scale_to_zero:\s*true/);
  assert.match(provider, /front_min_containers:\s*0/);
  assert.match(registration, /front_min_containers:\s*0/);
  assert.match(direct, /front_scale_to_zero:\s*true/);
  assert.match(direct, /front_min_containers:\s*0/);
});
