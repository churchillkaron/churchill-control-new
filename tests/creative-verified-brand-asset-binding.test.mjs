import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('brand binding runtime is generic, provenance gated, and workflow-bound before scoped assets load', () => {
  const binding = fs.readFileSync(new URL('../lib/creative/assets/runtime/CreativeVerifiedBrandAssetBindingRuntime.js', import.meta.url), 'utf8');
  const workflow = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', import.meta.url), 'utf8');
  assert.match(binding, /canonical_brand_asset/);
  assert.match(binding, /BRAND_REFERENCE/);
  assert.match(binding, /PRIMARY_SOURCE/);
  assert.match(binding, /ai_generated === true/);
  assert.match(binding, /usableSource/);
  assert.match(binding, /selected_asset_ids/);
  assert.doesNotMatch(binding, /607706dd|a6e5f946|Avantiqo Premium Global Campaign Test/);
  const bindIndex = workflow.indexOf('CreativeVerifiedBrandAssetBindingRuntime.bind');
  const scopedAssetsIndex = workflow.indexOf('CreativeAssetsRuntime.list({ organization_id, creative_mission_id, creative_project_id })');
  assert.ok(bindIndex >= 0 && scopedAssetsIndex > bindIndex);
});
