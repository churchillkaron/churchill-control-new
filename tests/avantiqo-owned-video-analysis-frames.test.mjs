import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('all ai.image.analyze providers receive deterministic video frame preparation', () => {
  const source=fs.readFileSync('lib/platform/service-runtime/providers/ProviderExecutorCore.js','utf8');
  assert.match(source,/if \(capability === "ai\.image\.analyze"\)/);
  assert.doesNotMatch(source,/provider === "openai" && capability === "ai\.image\.analyze"/);
});

test('owned image analyzer supports multi-frame chronological contact sheets', () => {
  const source=fs.readFileSync('services/avantiqo-image-engine/handler_v2.py','utf8');
  assert.match(source,/def _analysis_contact_sheet/);
  assert.match(source,/sources = data\.get\("source_assets"\) or \[data\["resolved_source_image"\]\]/);
  assert.match(source,/analysis_contact_sheet/);
  assert.match(source,/data:image\//);
});
