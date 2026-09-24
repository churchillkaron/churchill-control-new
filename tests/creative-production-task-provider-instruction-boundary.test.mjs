import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const runtime = fs.readFileSync('lib/operations/tasks/runtime/ProductionTaskRuntime.js','utf8');
const repository = fs.readFileSync('lib/operations/tasks/repositories/ProductionTaskRepository.js','utf8');

test('production tasks remain promptless at persistence boundary',()=>{
  assert.match(repository,/preparePromptlessPersistence/);
  assert.match(repository,/promptlessTask\(task, "CREATIVE_PRODUCTION_TASK"\)/);
});

test('visual generation reconstructs provider instruction only at execution boundary',()=>{
  assert.match(runtime,/serializeCreativeProviderInstruction/);
  assert.match(runtime,/provider_instruction_serialized_at_execution: true/);
  assert.match(runtime,/prompt: serializedInstruction/);
  assert.match(runtime,/negative_prompt: \[\.\.\.stillImageNegatives, \.\.\.negatives, \.\.\.prohibited\]/);
  assert.match(runtime,/width: providerParameters\.width \?\? outputSpec\.width/);
  assert.match(runtime,/height: providerParameters\.height \?\? outputSpec\.height/);
  assert.match(runtime,/seed: providerParameters\.seed \?\? input\.seed/);
  assert.match(runtime,/if \(!durationPricedCapabilities\.has\(capability\)\) return executionPayload/);
});
