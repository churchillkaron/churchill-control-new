import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js', import.meta.url), 'utf8');

test('temporal local reasoning identity includes effective request fingerprint', () => {
  assert.match(source, /function temporalReasoningUsageId\(/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /prompt: String\(prompt \?\? ""\)/);
  assert.match(source, /max_output_tokens: Math\.min\(Number\(maxOutputTokens\) \|\| 1024, 6000\)/);
  assert.match(source, /service_id: text\(serviceId\)/);
  assert.match(source, /usage_id: temporalReasoningUsageId\(\{ projectId, operation, prompt, maxOutputTokens, serviceId \}\)/);
});

test('temporal local reasoning no longer uses operation-only queue identity', () => {
  assert.doesNotMatch(source, /usage_id: `creative-temporal:\$\{projectId\}:\$\{operation\}`/);
});
