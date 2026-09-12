import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js',import.meta.url),'utf8');
test('passed tribunal is durable until downstream preproduction succeeds',()=>{
  assert.match(source,/creative_tribunal_approved_checkpoint/);
  assert.match(source,/CREATIVE_TRIBUNAL_APPROVED_CHECKPOINT_V1/);
  assert.match(source,/if \(approvedCheckpoint\) return approvedCheckpoint/);
  assert.match(source,/await persistTribunalApprovedMaster\(context, master\)/);
  assert.match(source,/await clearResolvedDirectionCheckpoints\(context\)/);
  assert.doesNotMatch(source,/const master = await CreativeDynamicTribunalRuntime\.review\(reviewInput\);\s*await clearTribunalResume/);
});
