import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Node01 local intelligence baseline is 8192 context tokens', () => {
  const policy = read('lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js');
  const worker = read('scripts/local-node/avantiqo-node01-worker.ps1');
  const serviceWorker = read('services/avantiqo-music-local/node01_worker.ps1');
  assert.match(policy, /AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS = 8192/);
  assert.match(worker, /\$ContextTokens = 8192/);
  assert.match(serviceWorker, /\$ContextTokens = 8192/);
});

test('oversized deep local reasoning routes hierarchically before Modal', () => {
  const provider = read('lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js');
  const hierarchical = read('lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceHierarchicalLocalRuntime.js');
  const hierarchicalIndex = provider.indexOf('shouldUseHierarchicalLocalIntelligence(input)');
  const modalIndex = provider.indexOf('return executeIntelligenceModalDirect(input)');
  assert.ok(hierarchicalIndex >= 0);
  assert.ok(modalIndex > hierarchicalIndex);
  assert.match(hierarchical, /AVANTIQO_HIERARCHICAL_LOCAL_REASONING_V1/);
  assert.match(hierarchical, /executeIntelligenceLocalQueueAndWait/);
  assert.match(hierarchical, /modal_inference_performed: false/);
  assert.match(hierarchical, /runpod_inference_performed: false/);
  assert.match(hierarchical, /hierarchical_chunk_count/);
});
