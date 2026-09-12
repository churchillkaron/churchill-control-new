import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../lib/creative/director/orchestrator/CreativePipelineOrchestrator.js', import.meta.url), 'utf8');

test('durable temporal checkpoints receive canonical lineage before production validation', () => {
  assert.match(source, /CreativeStoryLineageContractRuntime\.validate\(plan\)\.passed/);
  assert.match(source, /CreativeStoryLineageContractRuntime\.build\(\{ plan, research \}\)/);
  assert.match(source, /plan = lineageBuild\.plan;/);
  assert.match(source, /assertTemporalRuntime\(plan\);/);
  assert.ok(source.indexOf('plan = lineageBuild.plan;') < source.indexOf('assertTemporalRuntime(plan);'));
});
