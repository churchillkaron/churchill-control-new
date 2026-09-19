import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourcePath = new URL(
  '../lib/creative/reasoning/runtime/CreativeReasoningRequestCostEstimateRuntime.js',
  import.meta.url,
);

test('creative reasoning estimate never shrinks upstream reservation headroom', async () => {
  const source = await readFile(sourcePath, 'utf8');

  assert.match(source, /const incomingGuard = object\(input\.cost_guard \|\| input\.costGuard\)/);
  assert.match(source, /const guardedInputTokens = Math\.max\([\s\S]*usageEstimate\.estimated_input_tokens,[\s\S]*upstreamInputTokens \|\| 0/);
  assert.match(source, /const guardedOutputTokens = Math\.max\([\s\S]*usageEstimate\.estimated_output_tokens,[\s\S]*upstreamOutputTokens \|\| 0/);
  assert.match(source, /estimated_input_tokens: guardedInputTokens/);
  assert.match(source, /estimated_output_tokens: guardedOutputTokens/);
  assert.match(source, /creative_reasoning_preserved_upstream_reservation_headroom/);
});
